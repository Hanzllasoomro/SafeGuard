"""
SafeGuard AI — Image & Video Upload API
"""
import json
import os
import shutil
import uuid
import cv2
from fastapi import APIRouter, UploadFile, File, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime

from db.database import get_db
from db.models import Violation
from detection.model import PPEDetector
from detection.violation_logic import compute_violations
from detection.annotator import annotate_frame
from detection.deduplicator import deduplicator
from config import settings
from alerts.alert_manager import trigger_alerts

router = APIRouter()
_detector = None


def get_detector():
    """Lazy-load the PPE detector singleton."""
    global _detector
    if _detector is None:
        _detector = PPEDetector()
    return _detector


def _serialize_detections(detections):
    """Convert detection dicts to JSON-safe form (bbox is already a list of ints)."""
    return [
        {
            "class_id": d["class_id"],
            "class_name": d["class_name"],
            "confidence": round(float(d["confidence"]), 4),
            "bbox": [int(x) for x in d["bbox"]],
        }
        for d in detections
    ]


@router.post("/api/upload/image")
async def upload_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    det = get_detector()

    # Save uploaded file to temp
    os.makedirs("temp", exist_ok=True)
    temp_path = f"temp/{uuid.uuid4()}_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Read and process image
    image = cv2.imread(temp_path)
    if image is None:
        os.remove(temp_path)
        return {"error": "Could not read image file"}

    detections = det.detect(image)
    violations = compute_violations(detections)
    annotated = annotate_frame(image.copy(), detections, violations)

    # Save annotated screenshot
    screenshot_filename = f"{uuid.uuid4()}.jpg"
    screenshot_path = os.path.join(settings.SCREENSHOT_DIR, screenshot_filename)
    cv2.imwrite(screenshot_path, annotated)
    screenshot_url = f"/screenshots/{screenshot_filename}"

    # Compute stats
    total_persons = len(violations)
    violating = sum(1 for v in violations if v["status"] == "VIOLATION")
    compliant = max(0, total_persons - violating)

    full_detections_json = json.dumps(_serialize_detections(detections))

    # Log violations to database (deduplicated per source+missing_ppe)
    suppressed_count = 0
    for v in violations:
        if v["status"] != "VIOLATION":
            continue

        if not deduplicator.should_log("image_upload", v["missing_ppe"]):
            suppressed_count += 1
            continue

        db_violation = Violation(
            timestamp=datetime.utcnow(),
            violation_type=f"Missing: {', '.join(v['missing_ppe'])}",
            person_count=total_persons,
            violation_count=violating,
            screenshot_path=screenshot_url,
            confidence=v["confidence"],
            missing_ppe=", ".join(v["missing_ppe"]),
            details=f"Image upload: {file.filename}",
            bbox=json.dumps([int(x) for x in v["person_bbox"]]),
            detections=full_detections_json,
            source="image_upload",
        )
        db.add(db_violation)
        db.commit()
        db.refresh(db_violation)

        violation_dict = {
            "id": db_violation.id,
            "violation_type": db_violation.violation_type,
            "missing_ppe": db_violation.missing_ppe,
            "person_count": db_violation.person_count,
            "confidence": db_violation.confidence,
            "screenshot_path": screenshot_path,
            "timestamp": str(db_violation.timestamp),
            "details": db_violation.details,
            "source": db_violation.source,
        }
        background_tasks.add_task(trigger_alerts, violation_dict, screenshot_path)

    # Cleanup temp
    os.remove(temp_path)

    return {
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
                "has_ppe": v["has_ppe"],
                "status": v["status"],
                "confidence": round(v["confidence"], 3),
            }
            for v in violations
        ],
        "annotated_image_url": screenshot_url,
        "stats": {
            "total_persons": total_persons,
            "compliant": compliant,
            "violations": violating,
            "suppressed_by_cooldown": suppressed_count,
        },
    }


@router.post("/api/upload/video")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...), db: Session = Depends(get_db)):
    det = get_detector()
    os.makedirs("temp", exist_ok=True)
    temp_path = f"temp/{uuid.uuid4()}_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    cap = cv2.VideoCapture(temp_path)
    frame_count = 0
    violation_frames = []
    total_violations_detected = 0
    total_suppressed = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1
        if frame_count % 3 != 0:
            continue

        detections = det.detect(frame)
        violations = compute_violations(detections)
        violating = [v for v in violations if v["status"] == "VIOLATION"]

        if violating:
            annotated = annotate_frame(frame.copy(), detections, violations)
            screenshot_filename = f"{uuid.uuid4()}.jpg"
            screenshot_path = os.path.join(settings.SCREENSHOT_DIR, screenshot_filename)
            cv2.imwrite(screenshot_path, annotated)
            screenshot_url = f"/screenshots/{screenshot_filename}"

            total_persons = len(violations)
            full_detections_json = json.dumps(_serialize_detections(detections))

            recorded_any = False
            for v in violating:
                # Cooldown key: (source, missing_ppe). Frame index is NOT part of
                # the key so a sustained violation across many sampled frames
                # only logs once per cooldown window.
                if not deduplicator.should_log("video_upload", v["missing_ppe"]):
                    total_suppressed += 1
                    continue

                db_violation = Violation(
                    timestamp=datetime.utcnow(),
                    violation_type=f"Missing: {', '.join(v['missing_ppe'])}",
                    person_count=total_persons,
                    violation_count=len(violating),
                    screenshot_path=screenshot_url,
                    confidence=v["confidence"],
                    missing_ppe=", ".join(v["missing_ppe"]),
                    details=f"Video frame #{frame_count}",
                    bbox=json.dumps([int(x) for x in v["person_bbox"]]),
                    detections=full_detections_json,
                    source="video_upload",
                )
                db.add(db_violation)
                db.commit()
                db.refresh(db_violation)

                violation_dict = {
                    "id": db_violation.id,
                    "violation_type": db_violation.violation_type,
                    "missing_ppe": db_violation.missing_ppe,
                    "person_count": db_violation.person_count,
                    "confidence": db_violation.confidence,
                    "screenshot_path": screenshot_path,
                    "timestamp": str(db_violation.timestamp),
                    "details": db_violation.details,
                    "source": db_violation.source,
                }
                background_tasks.add_task(trigger_alerts, violation_dict, screenshot_path)
                recorded_any = True

            # Append a frame summary when something was logged (or about to be
            # logged) so the response captures the first occurrence at minimum.
            if recorded_any:
                violation_frames.append(
                    {
                        "frame_number": frame_count,
                        "violations": [
                            {"missing_ppe": v["missing_ppe"], "status": v["status"]}
                            for v in violating
                        ],
                        "screenshot_url": screenshot_url,
                    }
                )
            total_violations_detected += len(violating)

    cap.release()
    os.remove(temp_path)

    return {
        "total_frames": frame_count,
        "violations_detected": total_violations_detected,
        "violations_logged": total_violations_detected - total_suppressed,
        "suppressed_by_cooldown": total_suppressed,
        "violation_frames": violation_frames,
    }
