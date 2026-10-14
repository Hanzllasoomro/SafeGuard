"""
SafeGuard AI — WebSocket Live Stream Manager.

Phase 2 Slice 2 — multi-camera support.

The capture/detect/broadcast loop is now parameterised on a `camera_id` path
param. A producer pulls frames from `cv2.VideoCapture(camera.url)` (or the
local webcam index for `source_type == "webcam"`), runs detection, and
broadcasts the annotated JPEG-base64 frame to all connected WS clients.

Inference (`session.run`) is synchronous and CPU-blocking. We offload it and
`cv2.imencode` to a thread executor so the asyncio loop stays free for
broadcast and other clients. With one camera this is invisible; with N
cameras it prevents one slow frame from stalling all others.

Violations produced by the live stream are written to the `violations` table
with `source = f"camera:{camera.id}"`. The existing `ViolationDeduplicator`
already keys on `source`, so each camera gets its own cooldown bucket
automatically — no changes needed there.
"""
import asyncio
import base64
import json
import sys
from datetime import datetime
from typing import List

import cv2
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from alerts.alert_manager import trigger_alerts
from api.upload import _serialize_detections
from config import settings
from db.database import SessionLocal
from db.models import Camera, Violation
from detection.annotator import annotate_frame
from detection.deduplicator import deduplicator
from detection.model import PPEDetector
from detection.violation_logic import compute_violations

router = APIRouter()
_detector = None


def get_detector():
    global _detector
    if _detector is None:
        _detector = PPEDetector()
    return _detector


class ConnectionManager:
    """Manages WebSocket connections for live streaming.

    Phase 2 keeps a flat list — one camera per dashboard session for the
    minimum viable slice. Multi-camera grid is deferred.
    """

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()


def _build_capture(camera: Camera) -> cv2.VideoCapture:
    """Resolve a Camera row to an open cv2.VideoCapture. Caller is responsible
    for releasing it."""
    if camera.source_type == "webcam":
        # url stores the integer index as a string; default to 0.
        idx = int(camera.url) if (camera.url and camera.url.isdigit()) else 0
        # Prefer DirectShow on Windows — MSMF (the default) often returns
        # `isOpened() == True` even when no real device is present, which
        # makes the live stream silently show a black/empty frame.
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        return cv2.VideoCapture(idx, backend)
    # ip / rtsp — inject credentials if the row carries them and the URL
    # doesn't already include them.
    url = camera.url or ""
    if camera.username and camera.password and "://" in url and "@" not in url.split("://", 1)[1]:
        scheme, rest = url.split("://", 1)
        url = f"{scheme}://{camera.username}:{camera.password}@{rest}"
    return cv2.VideoCapture(url)


def _write_violations(camera: Camera, frame, detections, violations) -> int:
    """Persist violations to the DB. Runs in a thread via run_in_executor.
    Returns the number of rows written (after dedup)."""
    full_detections_json = json.dumps(_serialize_detections(detections))
    written = 0
    db = SessionLocal()
    try:
        for v in violations:
            if v["status"] != "VIOLATION":
                continue
            source = f"camera:{camera.id}"
            if not deduplicator.should_log(source, v["missing_ppe"]):
                continue
            row = Violation(
                timestamp=datetime.utcnow(),
                violation_type=f"Missing: {', '.join(v['missing_ppe'])}",
                person_count=sum(1 for d in detections if d["class_id"] == settings.PERSON_CLASS_ID),
                violation_count=sum(1 for vv in violations if vv["status"] == "VIOLATION"),
                screenshot_path=None,  # live stream doesn't persist a screenshot file
                confidence=v["confidence"],
                missing_ppe=", ".join(v["missing_ppe"]),
                details=f"Live camera: {camera.name} ({camera.location or 'unknown location'})",
                bbox=json.dumps([int(x) for x in v["person_bbox"]]),
                detections=full_detections_json,
                source=source,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            written += 1
            violation_dict = {
                "id": row.id,
                "violation_type": row.violation_type,
                "missing_ppe": row.missing_ppe,
                "person_count": row.person_count,
                "confidence": row.confidence,
                "screenshot_path": None,
                "timestamp": str(row.timestamp),
            }
            # Alerts fire-and-forget — alert_manager spawns its own thread.
            try:
                trigger_alerts(violation_dict, screenshot_path=None)
            except Exception as e:
                print(f"[WS] alert trigger failed: {e}")
    finally:
        db.close()
    return written


@router.websocket("/ws/stream/{camera_id}")
async def websocket_endpoint(websocket: WebSocket, camera_id: int):
    """WebSocket endpoint for real-time video stream with PPE detection.

    Phase 2: parameterised on `camera_id`. Look up the camera, open its
    capture, broadcast annotated frames, persist violations.
    """
    await manager.connect(websocket)
    det = get_detector()
    cap = None
    camera: Camera | None = None
    loop = asyncio.get_event_loop()

    try:
        db = SessionLocal()
        try:
            camera = db.query(Camera).filter(Camera.id == camera_id).first()
        finally:
            db.close()
        if camera is None:
            await websocket.send_json({"error": f"Camera {camera_id} not found"})
            await websocket.close(code=4404)
            manager.disconnect(websocket)
            return
        if not camera.enabled:
            await websocket.send_json({"error": f"Camera '{camera.name}' is disabled"})
            await websocket.close(code=4403)
            manager.disconnect(websocket)
            return

        cap = await loop.run_in_executor(None, _build_capture, camera)
        is_open = await loop.run_in_executor(None, cap.isOpened)
        if not is_open:
            await websocket.send_json({"error": f"Cannot open capture for camera '{camera.name}'"})
            await websocket.close(code=4400)
            manager.disconnect(websocket)
            return

        while True:
            ret, frame = await loop.run_in_executor(None, cap.read)
            if not ret:
                await asyncio.sleep(0.1)
                continue

            # Inference is CPU-blocking — keep the event loop free.
            detections = await loop.run_in_executor(None, det.detect, frame)
            violations = compute_violations(detections)

            # Persist violations off-loop (uses its own SessionLocal).
            if violations:
                written = await loop.run_in_executor(
                    None, _write_violations, camera, frame, detections, violations
                )
                if written:
                    # Best-effort annotation of the in-frame warning banner;
                    # the count of *new* rows this frame is unused at the moment.
                    pass

            annotated = annotate_frame(frame.copy(), detections, violations)

            # JPEG encode off-loop too (cv2.imencode is sync).
            def _encode(img):
                _, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
                return base64.b64encode(buffer).decode("utf-8")

            frame_base64 = await loop.run_in_executor(None, _encode, annotated)

            total_persons = sum(1 for d in detections if d["class_id"] == settings.PERSON_CLASS_ID)
            violating = sum(1 for v in violations if v["status"] == "VIOLATION")
            compliant = total_persons - violating
            compliance_rate = (compliant / total_persons * 100) if total_persons > 0 else 100.0

            data = {
                "camera_id": camera.id,
                "camera_name": camera.name,
                "frame": frame_base64,
                "detections": [
                    {
                        "class_id": d["class_id"],
                        "class_name": d["class_name"],
                        "confidence": round(d["confidence"], 3),
                        "bbox": d["bbox"],
                    }
                    for d in detections
                ],
                "violations": [
                    {
                        "person_bbox": v["person_bbox"],
                        "missing_ppe": v["missing_ppe"],
                        "status": v["status"],
                    }
                    for v in violations
                    if v["status"] == "VIOLATION"
                ],
                "stats": {
                    "persons": total_persons,
                    "compliant": compliant,
                    "violations": violating,
                    "compliance_rate": round(compliance_rate, 1),
                },
            }
            await websocket.send_json(data)
            await asyncio.sleep(0.033)  # ~30 FPS cap

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)
    finally:
        if cap is not None:
            cap.release()