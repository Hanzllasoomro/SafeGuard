"""
Cameras CRUD router.

Phase 2 Slice 2 — multi-camera management.

Endpoints
---------
GET    /api/cameras                 list all cameras
POST   /api/cameras                 create a camera (no auth guard at this
                                   milestone; Phase 3 will add JWT)
GET    /api/cameras/{id}            fetch a single camera
PUT    /api/cameras/{id}            partial update (any subset of fields)
DELETE /api/cameras/{id}            delete a camera
POST   /api/cameras/{id}/test       try to open the capture; return ok/error

Validation lives in Pydantic schemas (`CameraCreate`, `CameraUpdate`). The
webcam-vs-ip-vs-rtsp distinction is enforced by `source_type` + `url` rules.
"""
from typing import List, Optional

import asyncio
import cv2
import socket
import struct
import sys
import xml.etree.ElementTree as ET
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Camera

router = APIRouter()

VALID_SOURCE_TYPES = {"ip", "rtsp", "webcam"}


class CameraCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    source_type: str = Field(..., description="'ip' | 'rtsp' | 'webcam'")
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    location: Optional[str] = None
    enabled: bool = True

    @field_validator("source_type")
    @classmethod
    def _check_source_type(cls, v: str) -> str:
        if v not in VALID_SOURCE_TYPES:
            raise ValueError(f"source_type must be one of {sorted(VALID_SOURCE_TYPES)}")
        return v


class CameraUpdate(BaseModel):
    """Partial update — every field optional. Same validators apply when present."""

    name: Optional[str] = None
    source_type: Optional[str] = None
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    location: Optional[str] = None
    enabled: Optional[bool] = None

    @field_validator("source_type")
    @classmethod
    def _check_source_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in VALID_SOURCE_TYPES:
            raise ValueError(f"source_type must be one of {sorted(VALID_SOURCE_TYPES)}")
        return v


class CameraOut(BaseModel):
    id: int
    name: str
    source_type: str
    url: Optional[str]
    username: Optional[str]
    location: Optional[str]
    enabled: bool
    created_at: Optional[str]

    class Config:
        from_attributes = True


def _serialize(c: Camera) -> dict:
    """CameraOut with `created_at` rendered as ISO string (matches ViolationOut style)."""
    return {
        "id": c.id,
        "name": c.name,
        "source_type": c.source_type,
        "url": c.url,
        "username": c.username,
        "password": c.password,  # included for completeness in this FYP; UI should mask it
        "location": c.location,
        "enabled": c.enabled,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _validate_url_for_source(body: dict) -> None:
    """`url` is required for ip/rtsp, optional for webcam (defaults to '0')."""
    src = body.get("source_type")
    url = body.get("url")
    if src in ("ip", "rtsp") and not url:
        raise HTTPException(status_code=422, detail=f"url is required for source_type={src}")
    if src == "webcam" and not url:
        body["url"] = "0"


@router.get("/api/cameras")
def list_cameras(db: Session = Depends(get_db)) -> List[dict]:
    rows = db.query(Camera).order_by(Camera.id.asc()).all()
    return [_serialize(c) for c in rows]


@router.post("/api/cameras", status_code=201)
def create_camera(payload: CameraCreate, db: Session = Depends(get_db)) -> dict:
    data = payload.model_dump()
    _validate_url_for_source(data)
    if db.query(Camera).filter(Camera.name == data["name"]).first():
        raise HTTPException(status_code=409, detail=f"Camera name '{data['name']}' already exists")
    cam = Camera(**data)
    db.add(cam)
    db.commit()
    db.refresh(cam)
    return _serialize(cam)


# IMPORTANT: register `/api/cameras/scan-local` BEFORE the parametric
# `/api/cameras/{camera_id}` route below. FastAPI matches in registration
# order, so the latter would otherwise grab `/scan-local` as `camera_id` and
# reject it as a non-integer. Same reason `/{camera_id}/test` is harmless:
# its path has an extra segment that doesn't conflict.
#
# Same rule applies to `/api/cameras/auto-detect` directly below.
_ONVIF_MULTICAST_ADDR = "239.255.255.255"
_ONVIF_MULTICAST_PORT = 3702
_ONVIF_PROBE = (
    "<?xml version='1.0' encoding='utf-8'?>"
    '<Envelope xmlns:dn="http://www.onvif.org/ver10/network/wsdl" '
    'xmlns="http://www.w3.org/2003/05/soap-envelope">'
    "<Header>"
    '<wsa:MessageID xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">'
    "uuid:probe-{uuid}"
    "</wsa:MessageID>"
    '<wsa:To xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">'
    "urn:schemas-xmlsoap-org:ws:2005:04:discovery"
    "</wsa:To>"
    '<wsa:Action xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">'
    "http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe"
    "</wsa:Action>"
    "</Header>"
    "<Body>"
    "<Probe xmlns='http://schemas.xmlsoap.org/ws/2005/04/discovery'>"
    "<Types>dn:NetworkVideoTransmitter</Types>"
    "</Probe>"
    "</Body>"
    "</Envelope>"
)


async def _discover_onvif(timeout: float = 3.0) -> list[dict]:
    """WS-Discovery multicast probe for ONVIF cameras on the LAN.

    Returns a list of `{ip, port, manufacturer, model, xaddr}` dicts, deduped
    by `(ip, port)`. If multicast is blocked (corporate firewall, etc.) the
    helper returns `[]` instead of raising — the front-end treats that as
    "no ONVIF devices reachable" and still shows local webcams.

    Runs in a thread executor to keep the FastAPI event loop free. The
    timeout is intentionally short (default 3s) so the dashboard stays
    responsive on networks with no ONVIF devices — bump via
    `?onvif_timeout=` if a slower site is expected.
    """

    def _probe() -> list[dict]:
        import uuid as _uuid
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            # Bind to all interfaces on an OS-chosen port. Some Windows
            # builds refuse IP_ADD_MEMBERSHIP without an explicit bind.
            sock.bind(("", 0))
            mreq = struct.pack(
                "=4sl",
                bytes(int(b) for b in _ONVIF_MULTICAST_ADDR.split(".")),
                socket.INADDR_ANY,
            )
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            sock.settimeout(timeout)

            message_id = str(_uuid.uuid4())
            payload = _ONVIF_PROBE.format(uuid=message_id).encode("utf-8")
            sock.sendto(
                payload, (_ONVIF_MULTICAST_ADDR, _ONVIF_MULTICAST_PORT)
            )

            found: dict[tuple[str, int], dict] = {}
            # Loop on recv() until the socket times out — the
            # `sock.settimeout(timeout)` above is what bounds the wait.
            while True:
                try:
                    data, addr = sock.recvfrom(8192)
                except socket.timeout:
                    break
                except OSError:
                    break
                ip = addr[0]
                try:
                    root = ET.fromstring(data)
                except ET.ParseError:
                    continue
                # WS-Discovery ProbeMatches wrap a SequenceId/MessageNumber
                # then an arbitrary number of <ProbeMatch> elements. SOAP
                # namespace prefix differs across cameras, so match by
                # local-name.
                matches = [
                    el for el in root.iter() if el.tag.endswith("ProbeMatch")
                ]
                if not matches:
                    continue
                for m in matches:
                    xaddr_el = next(
                        (e for e in m.iter() if e.tag.endswith("XAddrs")), None
                    )
                    scopes_el = next(
                        (e for e in m.iter() if e.tag.endswith("Scopes")), None
                    )
                    types_el = next(
                        (e for e in m.iter() if e.tag.endswith("Types")), None
                    )
                    if xaddr_el is None or not xaddr_el.text:
                        continue
                    # XAddrs is a space-separated list of URLs; the first
                    # one is enough for "show me the camera" purposes.
                    first_url = xaddr_el.text.strip().split()[0]
                    # urlparse: scheme://host:port/path
                    from urllib.parse import urlparse
                    parsed = urlparse(first_url)
                    port = parsed.port or (443 if parsed.scheme == "https" else 80)
                    host = parsed.hostname or ip
                    manufacturer = ""
                    model = ""
                    if scopes_el is not None and scopes_el.text:
                        # Scopes are space-separated "onvif://www.onvif.org/<key>/<value>" URIs.
                        for s in scopes_el.text.split():
                            if s.startswith("onvif://www.onvif.org/name/"):
                                manufacturer = s.rsplit("/", 1)[-1] or ""
                            if s.startswith("onvif://www.onvif.org/hardware/"):
                                model = s.rsplit("/", 1)[-1] or ""
                    types = (
                        types_el.text.strip() if types_el is not None and types_el.text else ""
                    )
                    key = (host, port)
                    if key in found:
                        continue
                    found[key] = {
                        "ip": host,
                        "port": port,
                        "manufacturer": manufacturer,
                        "model": model,
                        "xaddr": first_url,
                        "types": types,
                    }
            return list(found.values())
        except Exception:
            # Multicast unsupported / blocked / sendto failed. The frontend
            # surfaces "no ONVIF devices found" instead of an error.
            return []
        finally:
            try:
                sock.close()
            except Exception:
                pass

    return await asyncio.get_event_loop().run_in_executor(None, _probe)


@router.get("/api/cameras/scan-local")
async def scan_cameras(max_index: int = 4) -> dict:
    """Enumerate local webcams. Frontend uses this to populate the
    `Webcam Index` dropdown on the Cameras add-form.

    Returns: `{"cameras": [{"index": 0, "width": 640, "height": 480, "backend": "DSHOW"}, ...]}`
    """
    cameras = await _scan_local_cameras(max_index=max_index)
    return {"cameras": cameras}


@router.get("/api/cameras/auto-detect")
async def auto_detect_cameras(max_index: int = 4, onvif_timeout: float = 3.0) -> dict:
    """Combined webcam + ONVIF discovery in one round-trip.

    Frontend's "Auto-Detect" button hits this once and shows the user a
    dialog with two sections: local webcams (ready to add) and ONVIF cameras
    on the LAN. The user picks which to add and they're POSTed individually
    through `POST /api/cameras` so existing validation + duplicate-name
    handling applies.

    Return shape:
        {
          "local":   [{"index":0,"width":640,"height":480,"backend":"DSHOW"}],
          "onvif":   [{"ip":"192.168.1.50","port":80,"manufacturer":"Hikvision",
                       "model":"DS-2CD","xaddr":"http://...","types":"..."}],
          "summary": {"local_count": 1, "onvif_count": 0},
        }
    """
    local = await _scan_local_cameras(max_index=max_index)
    onvif = await _discover_onvif(timeout=onvif_timeout)
    return {
        "local": local,
        "onvif": onvif,
        "summary": {
            "local_count": len(local),
            "onvif_count": len(onvif),
        },
    }


@router.get("/api/cameras/{camera_id}")
def get_camera(camera_id: int, db: Session = Depends(get_db)) -> dict:
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    return _serialize(cam)


@router.put("/api/cameras/{camera_id}")
def update_camera(camera_id: int, payload: CameraUpdate, db: Session = Depends(get_db)) -> dict:
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return _serialize(cam)
    # Re-validate url/source_type if either changed.
    merged = {**{c.name: getattr(cam, c.name) for c in cam.__table__.columns}, **data}
    _validate_url_for_source(merged)
    for k, v in data.items():
        setattr(cam, k, v)
    db.commit()
    db.refresh(cam)
    return _serialize(cam)


@router.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: int, db: Session = Depends(get_db)) -> dict:
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    db.delete(cam)
    db.commit()
    return {"status": "ok", "deleted_id": camera_id}


async def _try_open(camera: Camera) -> dict:
    """Open cv2.VideoCapture in a thread to avoid blocking the event loop."""

    def _open():
        url = camera.url or "0"
        # Webcam rows store the index as a string ("0", "1", ...); cv2 wants int.
        if camera.source_type == "webcam":
            idx = int(url) if url.isdigit() else 0
            # Prefer DirectShow on Windows — MSMF (the default) often returns
            # `isOpened() == True` even when no device is present, which makes
            # the test endpoint lie about success.
            backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
            cap = cv2.VideoCapture(idx, backend)
        else:
            if camera.username and camera.password and "://" in url and "@" not in url.split("://", 1)[1]:
                scheme, rest = url.split("://", 1)
                url = f"{scheme}://{camera.username}:{camera.password}@{rest}"
            cap = cv2.VideoCapture(url)
        try:
            ok = cap.isOpened()
            return ok
        finally:
            cap.release()

    ok = await asyncio.get_event_loop().run_in_executor(None, _open)
    if ok:
        return {"ok": True, "message": f"Camera '{camera.name}' opened successfully"}
    return {"ok": False, "message": f"Could not open camera '{camera.name}'. Check the URL/index."}


@router.post("/api/cameras/{camera_id}/test")
async def test_camera(camera_id: int, db: Session = Depends(get_db)) -> dict:
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    return await _try_open(cam)


async def _scan_local_cameras(max_index: int = 4) -> list[dict]:
    """Enumerate local webcam indices 0..max_index-1 and return only those
    that actually produce a frame (CAP_ANY alone lies on Windows).

    Runs in a thread executor to keep the event loop free. Each candidate is
    opened, read once, and immediately released — the scan itself doesn't hold
    any capture open. Max-index default 4 keeps the scan snappy on laptops
    that don't have anything past index 0; bump via `?max_index=` if needed.
    """

    def _scan() -> list[dict]:
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        found: list[dict] = []
        for idx in range(max_index):
            cap = cv2.VideoCapture(idx, backend)
            if not cap.isOpened():
                cap.release()
                continue
            # Confirm the device is real: MSMF reports "open" for absent
            # devices on Windows, but `read()` returns False. Without this
            # check the scan returns phantom indices.
            ret, frame = cap.read()
            cap.release()
            if not ret or frame is None:
                continue
            h, w = frame.shape[:2]
            found.append({
                "index": idx,
                "width": int(w),
                "height": int(h),
                "backend": "DSHOW" if sys.platform == "win32" else "ANY",
            })
        return found

    return await asyncio.get_event_loop().run_in_executor(None, _scan)