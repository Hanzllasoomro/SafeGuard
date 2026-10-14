from typing import List, Dict
from config import settings


def compute_iou(box_a: List[int], box_b: List[int]) -> float:
    """Standard IoU between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(box_a[0], box_b[0])
    yA = max(box_a[1], box_b[1])
    xB = min(box_a[2], box_b[2])
    yB = min(box_a[3], box_b[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    if interArea == 0:
        return 0.0

    boxAArea = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    boxBArea = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])

    iou = interArea / float(boxAArea + boxBArea - interArea)
    return iou


def compute_ppe_containment(person_box: List[int], ppe_box: List[int]) -> float:
    """Compute how much of the PPE item is contained inside the person's bounding box.
    Returns: intersection_area / ppe_area (ranges from 0.0 to 1.0).
    
    Why this is needed:
    A person's box is large (~200,000 px^2) while a helmet or mask is small (~10,000 px^2).
    Standard IoU between a helmet and a full person can almost never exceed 0.05 (5%),
    which falsely failed standard 0.3 IoU thresholds.
    Measuring PPE containment solves this: if >= 40% of the helmet/vest is inside the person,
    it belongs to that person.
    """
    xA = max(person_box[0], ppe_box[0])
    yA = max(person_box[1], ppe_box[1])
    xB = min(person_box[2], ppe_box[2])
    yB = min(person_box[3], ppe_box[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    if interArea == 0:
        return 0.0

    ppeArea = (ppe_box[2] - ppe_box[0]) * (ppe_box[3] - ppe_box[1])
    if ppeArea <= 0:
        return 0.0

    return interArea / float(ppeArea)


def is_ppe_associated_with_person(person_box: List[int], ppe_box: List[int], class_name: str) -> bool:
    """Check if a detected PPE item belongs to a specific person."""
    containment = compute_ppe_containment(person_box, ppe_box)
    
    # Check if at least 35% of the PPE is inside the person's bounding box
    if containment >= 0.35:
        return True

    # Alternatively, check if the center point of the PPE is inside the person's box
    ppe_cx = (ppe_box[0] + ppe_box[2]) / 2.0
    ppe_cy = (ppe_box[1] + ppe_box[3]) / 2.0
    
    # Allow slight margin for helmets on top of head
    margin_y = (person_box[3] - person_box[1]) * 0.1
    if (person_box[0] <= ppe_cx <= person_box[2]) and (person_box[1] - margin_y <= ppe_cy <= person_box[3]):
        # If center is inside and containment is at least 20%, it's associated
        if containment >= 0.20:
            return True

    return False


def compute_violations(detections: List[Dict], required_ppe: List[str] = None) -> List[Dict]:
    if required_ppe is None:
        required_ppe = list(settings.REQUIRED_PPE)

    persons = [d for d in detections if d["class_id"] == settings.PERSON_CLASS_ID]
    ppes = [d for d in detections if d["class_id"] != settings.PERSON_CLASS_ID]

    results = []

    for person in persons:
        has_ppe = []
        for ppe in ppes:
            if ppe["class_name"] not in required_ppe:
                continue

            if is_ppe_associated_with_person(person["bbox"], ppe["bbox"], ppe["class_name"]):
                if ppe["class_name"] not in has_ppe:
                    has_ppe.append(ppe["class_name"])

        missing_ppe = [item for item in required_ppe if item not in has_ppe]
        status = "VIOLATION" if missing_ppe else "COMPLIANT"

        results.append({
            "person_bbox": person["bbox"],
            "missing_ppe": missing_ppe,
            "has_ppe": has_ppe,
            "status": status,
            "confidence": person["confidence"]
        })

    return results
