"""
SafeGuard AI — Frame Annotator

Renders professional bounding boxes, class labels, and safety violation banners.
Guarantees label visibility by clamping coordinates and avoiding clipping off-screen.
"""

from typing import List, Dict
import cv2
import numpy as np
from config import settings


def annotate_frame(frame: np.ndarray, detections: List[Dict], violations: List[Dict]) -> np.ndarray:
    annotated = frame.copy()
    has_violation = any(v.get("status") == "VIOLATION" for v in violations)
    frame_h, frame_w = annotated.shape[:2]

    # ── Top Warning Banner ──
    banner_height = 45
    if has_violation:
        # Semi-transparent red banner
        overlay = annotated.copy()
        cv2.rectangle(overlay, (0, 0), (frame_w, banner_height), settings.VIOLATION_COLOR, -1)
        cv2.addWeighted(overlay, 0.85, annotated, 0.15, 0, annotated)

        banner_text = "WARNING: PPE VIOLATION DETECTED"
        cv2.putText(
            annotated,
            banner_text,
            (20, 31),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.85,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

    # ── Draw Individual PPE Detections ──
    for det in detections:
        if det.get("class_id") == settings.PERSON_CLASS_ID:
            continue

        box = det["bbox"]
        class_name = det["class_name"]
        color = settings.CLASS_COLORS.get(class_name, (255, 255, 255))
        # Convert RGB to BGR for cv2
        color_bgr = (color[2], color[1], color[0])

        x1, y1, x2, y2 = box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color_bgr, 2)

        # Label badge
        conf = det.get("confidence", 0.0)
        label = f"{class_name} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)

        # Position label: prefer above box, fallback inside if near top
        top_offset = banner_height + 5 if has_violation else 5
        if y1 - th - 6 < top_offset:
            badge_y1 = y1
            badge_y2 = y1 + th + 6
            text_y = y1 + th + 2
        else:
            badge_y1 = y1 - th - 6
            badge_y2 = y1
            text_y = y1 - 4

        badge_x2 = min(frame_w - 2, x1 + tw + 8)
        cv2.rectangle(annotated, (x1, badge_y1), (badge_x2, badge_y2), color_bgr, -1)
        cv2.putText(
            annotated,
            label,
            (x1 + 4, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 0, 0),
            1,
            cv2.LINE_AA,
        )

    # ── Draw Persons & Violation Status Badges ──
    for v in violations:
        box = v["person_bbox"]
        x1, y1, x2, y2 = [int(coord) for coord in box]

        if v["status"] == "COMPLIANT":
            box_color = settings.COMPLIANT_COLOR
            label = "COMPLIANT"
            text_color = (0, 0, 0)
        else:
            box_color = settings.VIOLATION_COLOR
            missing = v.get("missing_ppe", [])
            missing_str = ", ".join(missing) if missing else "PPE Missing"
            label = f"Missing: {missing_str}"
            text_color = (255, 255, 255)

        # Draw person bounding box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, 2)

        # Measure text size
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)

        # Ensure badge stays within image bounds and doesn't collide with banner
        top_offset = banner_height + 5 if has_violation else 5
        if y1 - th - 10 < top_offset:
            # Render inside the box at the top
            badge_y1 = y1
            badge_y2 = y1 + th + 10
            text_y = y1 + th + 4
        else:
            # Render directly above the box
            badge_y1 = y1 - th - 10
            badge_y2 = y1
            text_y = y1 - 4

        badge_x1 = max(2, x1)
        badge_x2 = min(frame_w - 2, x1 + tw + 12)

        cv2.rectangle(annotated, (badge_x1, badge_y1), (badge_x2, badge_y2), box_color, -1)
        cv2.putText(
            annotated,
            label,
            (badge_x1 + 6, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            text_color,
            2,
            cv2.LINE_AA,
        )

    return annotated
