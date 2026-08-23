"""
SafeGuard AI — End-to-end backend test.

Boots no server of its own; expects uvicorn already running on PORT.
Hits every endpoint that the recent diff touches and a few legacy ones,
asserting the response shapes and side-effects (DB rows, debug-log file).

Run with:
    PYTHONIOENCODING=utf-8 backend/venv/Scripts/python.exe backend/test_e2e.py
"""
import io
import json
import os
import sys
import time
import uuid

# Run from backend/ so relative paths in handlers (temp/, screenshots/) work.
BACKEND = os.path.dirname(os.path.abspath(__file__))
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

import httpx  # noqa: E402

# Default to 8766 — matches the Vite dev proxy (frontend/vite.config.js). Override
# with E2E_BASE if the backend is running on a different port.
BASE = os.environ.get("E2E_BASE", "http://127.0.0.1:8766")
DEBUG_LOG = os.path.join(BACKEND, ".alert-debug.log")
SAMPLE_JPG = os.path.join(BACKEND, "screenshots", "754a425d-57b4-4993-bef1-c6f5f7ab0396.jpg")

results = []  # list of (name, ok, detail)


def record(name, ok, detail=""):
    tag = "PASS" if ok else "FAIL"
    results.append((name, ok, detail))
    print(f"  [{tag}] {name} {('— ' + detail) if detail else ''}")


def section(title):
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60)


def main():
    if not os.path.exists(SAMPLE_JPG):
        record("preconditions: sample image exists", False, f"missing {SAMPLE_JPG}")
        return

    # Snapshot debug log size so we can tell NEW lines apart from prior runs.
    log_size_before = os.path.getsize(DEBUG_LOG) if os.path.exists(DEBUG_LOG) else 0

    with httpx.Client(base_url=BASE, timeout=30.0) as client:
        # 1. Root
        section("1. GET /")
        r = client.get("/")
        record("root 200", r.status_code == 200, f"status={r.status_code}")
        if r.status_code == 200:
            data = r.json()
            record("root payload has name/version/status",
                   data.get("name") == "SafeGuard AI" and "version" in data and data.get("status") == "running",
                   f"data={data}")

        # 2. Health
        section("2. GET /api/health")
        r = client.get("/api/health")
        record("health 200", r.status_code == 200)
        h = r.json()
        record("health email_enabled=true (env)", h.get("email_enabled") is True)
        record("health whatsapp_enabled=true (env)", h.get("whatsapp_enabled") is True)
        record("health model_loaded", h.get("model_loaded") is True)
        record("health db_connected", h.get("db_connected") is True)

        # 3. GET /api/settings/alerts
        section("3. GET /api/settings/alerts")
        r = client.get("/api/settings/alerts")
        record("get_alert_settings 200", r.status_code == 200)
        if r.status_code == 200:
            s = r.json()
            for key in ("email_enabled", "whatsapp_enabled", "email_recipients",
                        "whatsapp_recipient", "email_cooldown", "whatsapp_cooldown",
                        "confidence_threshold"):
                record(f"settings has {key}", key in s)

        # 4. PUT /api/settings/alerts — round-trip the values
        section("4. PUT /api/settings/alerts")
        new_settings = {
            "email_enabled": True,
            "whatsapp_enabled": True,
            "email_recipients": "ops@example.com",
            "whatsapp_recipient": "+15555550100",
            "email_cooldown": 0,
            "whatsapp_cooldown": 0,
            "confidence_threshold": 0.5,
        }
        r = client.put("/api/settings/alerts", json=new_settings)
        record("update_alert_settings 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        if r.status_code == 200:
            s = r.json()
            record("put email_enabled persisted", s.get("email_enabled") is True)
            record("put email_recipients persisted", s.get("email_recipients") == "ops@example.com")

        # 5. POST /api/settings/alerts/test-email
        section("5. POST /api/settings/alerts/test-email")
        r = client.post("/api/settings/alerts/test-email")
        record("test_email 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        if r.status_code == 200:
            t = r.json()
            record("test_email transport=debug", t.get("transport") == "debug", f"got={t.get('transport')}")
            record("test_email ok=true", t.get("ok") is True, f"got={t.get('ok')}")
            record("test_email message present", isinstance(t.get("message"), str) and len(t["message"]) > 0)

        # 6. POST /api/settings/alerts/test-whatsapp
        section("6. POST /api/settings/alerts/test-whatsapp")
        r = client.post("/api/settings/alerts/test-whatsapp")
        record("test_whatsapp 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        if r.status_code == 200:
            t = r.json()
            record("test_whatsapp transport=debug", t.get("transport") == "debug")
            record("test_whatsapp ok=true", t.get("ok") is True)

        # 7. Debug log actually got new entries
        section("7. Debug log written")
        time.sleep(0.3)  # give the async writes a beat to flush
        log_size_after = os.path.getsize(DEBUG_LOG) if os.path.exists(DEBUG_LOG) else 0
        record("debug log grew", log_size_after > log_size_before,
               f"before={log_size_before} after={log_size_after}")
        if log_size_after > log_size_before:
            with open(DEBUG_LOG, "r", encoding="utf-8") as f:
                f.seek(log_size_before)
                tail = f.read()
            record("debug log has email entry", "channel=email" in tail or "channel=email-debug" in tail)
            record("debug log has whatsapp entry", "channel=whatsapp" in tail)

        # 8. POST /api/upload/image
        section("8. POST /api/upload/image")
        with open(SAMPLE_JPG, "rb") as f:
            jpg_bytes = f.read()
        files = {"file": ("test.jpg", jpg_bytes, "image/jpeg")}
        r = client.post("/api/upload/image", files=files)
        record("upload_image 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        upload_data = {}
        if r.status_code == 200:
            upload_data = r.json()
            record("upload has detections list", isinstance(upload_data.get("detections"), list))
            record("upload has stats", isinstance(upload_data.get("stats"), dict))
            record("upload has annotated_image_url starting /screenshots/",
                   isinstance(upload_data.get("annotated_image_url"), str)
                   and upload_data["annotated_image_url"].startswith("/screenshots/"))
            # Annotated screenshot actually on disk?
            if upload_data.get("annotated_image_url"):
                shot_path = os.path.join(BACKEND, upload_data["annotated_image_url"].lstrip("/"))
                record("annotated screenshot saved to disk", os.path.exists(shot_path),
                       f"path={shot_path}")

        # 9. GET /api/violations (legacy shape: flat array)
        section("9. GET /api/violations (legacy flat-array)")
        r = client.get("/api/violations", params={"limit": 5, "offset": 0})
        record("get_violations 200", r.status_code == 200)
        if r.status_code == 200:
            data = r.json()
            record("get_violations returns list", isinstance(data, list))
            record("get_violations list len<=limit", len(data) <= 5)
            if data:
                v0 = data[0]
                for key in ("id", "timestamp", "violation_type", "missing_ppe", "source"):
                    record(f"violation has {key}", key in v0)

        # 10. GET /api/violations (paginated: page/per_page)
        section("10. GET /api/violations?page=1&per_page=2")
        r = client.get("/api/violations", params={"page": 1, "per_page": 2})
        record("get_violations paginated 200", r.status_code == 200)
        if r.status_code == 200:
            data = r.json()
            record("paginated has items/total/page/per_page",
                   all(k in data for k in ("items", "total", "page", "per_page")),
                   f"keys={list(data.keys())}")
            record("paginated items<=per_page", len(data.get("items", [])) <= 2)
            record("paginated page=1", data.get("page") == 1)
            record("paginated per_page=2", data.get("per_page") == 2)

        # 11. GET /api/violations with date filter
        section("11. GET /api/violations?date_from=2024-01-01")
        r = client.get("/api/violations", params={"date_from": "2024-01-01", "limit": 5})
        record("date_filter 200", r.status_code == 200, f"body={r.text[:200]}")
        if r.status_code == 200:
            data = r.json()
            record("date_filter returns list", isinstance(data, list))

        # 12. GET /api/violations with malformed date — should still 200
        section("12. GET /api/violations?date_from=not-a-date")
        r = client.get("/api/violations", params={"date_from": "not-a-date"})
        record("malformed_date returns 422", r.status_code == 422,
               f"status={r.status_code}")

        # 13. GET /api/stats/dashboard
        section("13. GET /api/stats/dashboard")
        r = client.get("/api/stats/dashboard")
        record("stats 200", r.status_code == 200)
        if r.status_code == 200:
            d = r.json()
            for key in ("total_violations", "today_violations", "violations_by_type",
                        "recent_violations", "avg_confidence"):
                record(f"stats has {key}", key in d, f"d={d}")

        # 14. POST /api/cameras + GET /api/cameras
        section("14. POST + GET /api/cameras")
        uniq = uuid.uuid4().hex[:8]
        cam_payload = {
            "name": f"e2e-cam-{uniq}",
            "source_type": "webcam",
            "url": "0",
            "location": "e2e test",
            "enabled": False,  # don't try to open during test
        }
        r = client.post("/api/cameras", json=cam_payload)
        record("create_camera 201", r.status_code == 201, f"status={r.status_code} body={r.text[:200]}")
        cam_id = None
        if r.status_code == 201:
            cam = r.json()
            cam_id = cam.get("id")
            record("create_camera returns id", isinstance(cam_id, int))
            record("create_camera name persisted", cam.get("name") == cam_payload["name"])
            record("create_camera source_type=webcam", cam.get("source_type") == "webcam")

        r = client.get("/api/cameras")
        record("list_cameras 200", r.status_code == 200)
        if r.status_code == 200:
            cams = r.json()
            record("list_cameras returns list", isinstance(cams, list))
            record("created camera in list", any(c.get("id") == cam_id for c in cams) if cam_id else False)

        # 15. GET /api/cameras/{id}
        section("15. GET /api/cameras/{id}")
        if cam_id:
            r = client.get(f"/api/cameras/{cam_id}")
            record("get_camera 200", r.status_code == 200)
            r = client.get("/api/cameras/9999999")
            record("get_camera 404", r.status_code == 404)

        # 16. PUT /api/cameras/{id}
        section("16. PUT /api/cameras/{id}")
        if cam_id:
            r = client.put(f"/api/cameras/{cam_id}", json={"location": "updated-location"})
            record("update_camera 200", r.status_code == 200)
            if r.status_code == 200:
                record("update_camera location persisted", r.json().get("location") == "updated-location")

        # 17. POST /api/cameras/{id}/test
        section("17. POST /api/cameras/{id}/test")
        if cam_id:
            r = client.post(f"/api/cameras/{cam_id}/test")
            record("test_camera 200", r.status_code == 200)
            if r.status_code == 200:
                t = r.json()
                record("test_camera has ok+message", "ok" in t and "message" in t, f"t={t}")

        # 18. Validation: source_type=invalid
        section("18. POST /api/cameras invalid source_type")
        bad = {"name": f"bad-{uniq}", "source_type": "banana", "url": "x"}
        r = client.post("/api/cameras", json=bad)
        record("invalid_source_type 422", r.status_code == 422, f"status={r.status_code}")

        # 19. Validation: ip without url
        section("19. POST /api/cameras ip without url")
        bad2 = {"name": f"bad2-{uniq}", "source_type": "ip"}
        r = client.post("/api/cameras", json=bad2)
        record("ip_without_url 422", r.status_code == 422, f"status={r.status_code}")

        # 20. Duplicate camera name -> 409
        section("20. POST duplicate camera name")
        if cam_id:
            r = client.post("/api/cameras", json=cam_payload)
            record("duplicate_camera 409", r.status_code == 409, f"status={r.status_code}")

        # 21. GET /api/cameras/scan-local — does NOT take an int param
        section("21. GET /api/cameras/scan-local")
        r = client.get("/api/cameras/scan-local")
        record("scan_local 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
        if r.status_code == 200:
            scan = r.json()
            record("scan_local returns cameras list", isinstance(scan.get("cameras"), list))

        # 22. DELETE /api/cameras/{id}
        section("22. DELETE /api/cameras/{id}")
        if cam_id:
            r = client.delete(f"/api/cameras/{cam_id}")
            record("delete_camera 200", r.status_code == 200, f"status={r.status_code}")
            r = client.get(f"/api/cameras/{cam_id}")
            record("get after delete 404", r.status_code == 404)

        # 23. GET /api/violations/{id}
        section("23. GET /api/violations/{id}")
        # Pick the most recent violation id
        r = client.get("/api/violations", params={"limit": 1})
        if r.status_code == 200 and isinstance(r.json(), list) and r.json():
            vid = r.json()[0]["id"]
            r = client.get(f"/api/violations/{vid}")
            record("get_violation 200", r.status_code == 200)
            if r.status_code == 200:
                v = r.json()
                record("get_violation bbox is list or null",
                       v.get("bbox") is None or isinstance(v["bbox"], list))
                record("get_violation detections is list",
                       isinstance(v.get("detections"), list))
            r = client.get("/api/violations/9999999")
            record("get_violation 404", r.status_code == 404)

        # 24. Clear violations — DO NOT actually delete in shared DB; skip unless
        # an env var opts in. Just confirm the endpoint exists and returns 200
        # when allowed, otherwise record a SKIP.
        section("24. DELETE /api/violations (skipped unless E2E_CLEAR=1)")
        if os.environ.get("E2E_CLEAR") == "1":
            r = client.delete("/api/violations")
            record("clear_violations 200", r.status_code == 200)
        else:
            record("clear_violations skipped", True, "E2E_CLEAR not set")

        # 25. Static /screenshots/<filename> served
        section("25. GET /screenshots/<file>")
        if upload_data.get("annotated_image_url"):
            r = client.get(upload_data["annotated_image_url"])
            record("screenshots served 200", r.status_code == 200,
                   f"status={r.status_code} ct={r.headers.get('content-type')}")

    # Summary
    section("SUMMARY")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"  passed: {passed}")
    print(f"  failed: {failed}")
    if failed:
        print("\nFailures:")
        for name, ok, detail in results:
            if not ok:
                print(f"  - {name}: {detail}")
        sys.exit(1)
    print("\nALL E2E TESTS PASSED")


if __name__ == "__main__":
    main()