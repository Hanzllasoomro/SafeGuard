"""
SafeGuard AI — Production-Grade PPE Violation & Compliance Engine

Architectural Design:
1. Canonical Normalization: Maps variations ('hardhat', 'safety helmet', 'vest', 'mask')
   to standard classes: 'Helmet', 'Safety Vest', 'Face Mask'.
2. Anatomical Zoning: Restricts PPE association to physiologically realistic regions
   (e.g., Helmet on head [top 35%], Vest on torso [15%-85%]).
3. Bipartite Mutual Exclusion: Scores every (person, PPE) pair and assigns each PPE
   item to the single best-matching person. No two workers can claim the same helmet.
4. Worker Synthesis: If YOLO detects a Helmet or Safety Vest without a 'Person' box
   (due to occlusion, close-up crop, or low detection confidence), an inferred worker
   envelope is synthesized so compliance is still accurately tracked.
5. Deterministic Violation Output: Explicitly guarantees 'missing_ppe', 'has_ppe',
   'status', and formatted 'violation_type'.
"""

from typing import List, Dict, Optional, Tuple
from config import settings


def normalize_ppe_name(name: str) -> str:
    """Normalize any PPE class name variation to canonical form."""
    if not name:
        return ""
    n = name.strip().lower()
    if "helm" in n or "hard" in n:
        return "Helmet"
    if "vest" in n:
        return "Safety Vest"
    if "mask" in n or "shield" in n:
        return "Face Mask"
    if "person" in n or "worker" in n:
        return "Person"
    return name.strip()


def compute_iou(box_a: List[int], box_b: List[int]) -> float:
    """Standard Intersection-over-Union (IoU) between two bounding boxes."""
    xA = max(box_a[0], box_b[0])
    yA = max(box_a[1], box_b[1])
    xB = min(box_a[2], box_b[2])
    yB = min(box_a[3], box_b[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    if interArea == 0:
        return 0.0

    boxAArea = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    boxBArea = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])

    return interArea / float(boxAArea + boxBArea - interArea)


def compute_containment(inner_box: List[int], outer_box: List[int]) -> float:
    """Fraction of inner_box contained inside outer_box (0.0 to 1.0)."""
    xA = max(inner_box[0], outer_box[0])
    yA = max(inner_box[1], outer_box[1])
    xB = min(inner_box[2], outer_box[2])
    yB = min(inner_box[3], outer_box[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    if interArea == 0:
        return 0.0

    innerArea = (inner_box[2] - inner_box[0]) * (inner_box[3] - inner_box[1])
    if innerArea <= 0:
        return 0.0

    return interArea / float(innerArea)


def get_anatomical_zone(person_box: List[int], ppe_type: str) -> List[int]:
    """Calculate the expected anatomical bounding box for a given PPE type
    relative to the person's bounding box."""
    px1, py1, px2, py2 = person_box
    pw = max(1, px2 - px1)
    ph = max(1, py2 - py1)

    if ppe_type == "Helmet":
        # Head zone: extends slightly above the person box up to top 35% of body
        return [
            int(px1 - 0.15 * pw),
            int(py1 - 0.15 * ph),
            int(px2 + 0.15 * pw),
            int(py1 + 0.35 * ph),
        ]
    elif ppe_type == "Face Mask":
        # Face zone: from top 5% to top 40% of body
        return [
            int(px1 - 0.10 * pw),
            int(py1 + 0.05 * ph),
            int(px2 + 0.10 * pw),
            int(py1 + 0.40 * ph),
        ]
    elif ppe_type == "Safety Vest":
        # Torso zone: from top 15% to 85% of body
        return [
            int(px1 - 0.15 * pw),
            int(py1 + 0.15 * ph),
            int(px2 + 0.15 * pw),
            int(py1 + 0.85 * ph),
        ]
    return person_box


def calculate_association_score(person_box: List[int], ppe_box: List[int], ppe_type: str) -> float:
    """Calculate an association compatibility score between a person and a PPE item.
    Returns a float between 0.0 (incompatible) and 1.0 (perfect match)."""
    # 1. Containment in the person's overall bounding box
    full_containment = compute_containment(ppe_box, person_box)

    # 2. Containment in the specific anatomical zone
    zone = get_anatomical_zone(person_box, ppe_type)
    zone_containment = compute_containment(ppe_box, zone)

    # Reject if PPE does not intersect with the anatomical zone or person
    if zone_containment < 0.20 and full_containment < 0.30:
        return 0.0

    # 3. Horizontal centroid alignment (a vest or helmet should align with the body axis)
    p_cx = (person_box[0] + person_box[2]) / 2.0
    ppe_cx = (ppe_box[0] + ppe_box[2]) / 2.0
    pw = max(1, person_box[2] - person_box[0])
    h_dist_ratio = abs(p_cx - ppe_cx) / float(pw)

    # If center is way too far horizontally, reject (belonging to another person)
    if h_dist_ratio > 0.65:
        return 0.0

    # Weighted composite score
    alignment_score = max(0.0, 1.0 - h_dist_ratio)
    score = (zone_containment * 0.55) + (full_containment * 0.30) + (alignment_score * 0.15)
    return score


def synthesize_workers_from_unclaimed_ppe(unclaimed_ppes: List[Dict], existing_persons: List[Dict]) -> List[Dict]:
    """When YOLO detects Helmet or Safety Vest but missed the Person box (e.g. occluded,
    sitting, close-up), synthesize an inferred worker bounding box."""
    synthesized = []
    helmets = [p for p in unclaimed_ppes if normalize_ppe_name(p["class_name"]) == "Helmet"]
    vests = [p for p in unclaimed_ppes if normalize_ppe_name(p["class_name"]) == "Safety Vest"]
    used_vests = set()

    # Match nearby helmet and vest into one inferred worker
    for h in helmets:
        hx1, hy1, hx2, hy2 = h["bbox"]
        hcx = (hx1 + hx2) / 2.0
        hw = hx2 - hx1
        hh = hy2 - hy1

        matched_vest = None
        for i, v in enumerate(vests):
            if i in used_vests:
                continue
            vx1, vy1, vx2, vy2 = v["bbox"]
            vcx = (vx1 + vx2) / 2.0
            vw = vx2 - vx1
            if abs(hcx - vcx) <= max(hw, vw) * 1.2 and vy1 >= hy1 - 10:
                matched_vest = (i, v)
                break

        if matched_vest:
            used_vests.add(matched_vest[0])
            v = matched_vest[1]
            vx1, vy1, vx2, vy2 = v["bbox"]
            px1 = min(hx1, vx1)
            py1 = hy1
            px2 = max(hx2, vx2)
            py2 = int(vy2 + (vy2 - vy1) * 0.8)
            synthesized.append({
                "bbox": [max(0, px1), max(0, py1), px2, py2],
                "confidence": round((h["confidence"] + v["confidence"]) / 2.0, 3),
                "class_id": settings.PERSON_CLASS_ID,
                "class_name": "Person",
                "inferred": True,
            })
        else:
            # Standalone helmet without detected person
            px1 = int(hx1 - 0.6 * hw)
            py1 = hy1
            px2 = int(hx2 + 0.6 * hw)
            py2 = int(hy1 + 5.5 * hh)
            synthesized.append({
                "bbox": [max(0, px1), max(0, py1), px2, py2],
                "confidence": h["confidence"],
                "class_id": settings.PERSON_CLASS_ID,
                "class_name": "Person",
                "inferred": True,
            })

    # Standalone vests without helmet and without detected person
    for i, v in enumerate(vests):
        if i not in used_vests:
            vx1, vy1, vx2, vy2 = v["bbox"]
            vw = vx2 - vx1
            vh = vy2 - vy1
            px1 = int(vx1 - 0.15 * vw)
            py1 = max(0, int(vy1 - 0.45 * vh))
            px2 = int(vx2 + 0.15 * vw)
            py2 = int(vy2 + 1.0 * vh)
            synthesized.append({
                "bbox": [max(0, px1), py1, px2, py2],
                "confidence": v["confidence"],
                "class_id": settings.PERSON_CLASS_ID,
                "class_name": "Person",
                "inferred": True,
            })

    return synthesized


def compute_violations(detections: List[Dict], required_ppe: Optional[List[str]] = None) -> List[Dict]:
    """Production-grade violation and PPE compliance analysis.

    Returns a list of dictionaries for each detected/inferred person:
    {
        "person_bbox": [x1, y1, x2, y2],
        "status": "COMPLIANT" | "VIOLATION",
        "missing_ppe": ["Helmet", "Safety Vest"],  # Exact list of missing items
        "has_ppe": ["Safety Vest"],                # Verified items worn
        "violation_type": "Missing: Helmet",       # Human-readable summary
        "confidence": float,
        "compliance_score": float (0.0 to 1.0)
    }
    """
    if required_ppe is None:
        required_ppe = list(settings.REQUIRED_PPE)

    # Normalize required PPE items
    canonical_required = []
    for item in required_ppe:
        c = normalize_ppe_name(item)
        if c and c not in canonical_required:
            canonical_required.append(c)

    if not canonical_required:
        canonical_required = ["Helmet", "Safety Vest"]

    # Separate Person and PPE detections
    persons = [d for d in detections if d.get("class_id") == settings.PERSON_CLASS_ID]
    ppes = [d for d in detections if d.get("class_id") != settings.PERSON_CLASS_ID]

    # Pre-filter PPEs to only those relevant to requirements
    filtered_ppes = []
    for ppe in ppes:
        canon_name = normalize_ppe_name(ppe.get("class_name", ""))
        if canon_name:
            filtered_ppes.append({**ppe, "canonical_name": canon_name})

    # Step 1: Bipartite Association between Persons and PPEs
    # Each PPE can only belong to ONE person (mutual exclusion)
    candidate_matches = []
    for p_idx, person in enumerate(persons):
        for ppe_idx, ppe in enumerate(filtered_ppes):
            score = calculate_association_score(person["bbox"], ppe["bbox"], ppe["canonical_name"])
            if score > 0.0:
                candidate_matches.append((score, p_idx, ppe_idx))

    # Sort matches by compatibility score descending (best match first)
    candidate_matches.sort(key=lambda x: x[0], reverse=True)

    person_ppe_map: Dict[int, List[Dict]] = {i: [] for i in range(len(persons))}
    assigned_ppes = set()
    assigned_ppe_types_per_person: Dict[int, set] = {i: set() for i in range(len(persons))}

    for score, p_idx, ppe_idx in candidate_matches:
        ppe = filtered_ppes[ppe_idx]
        ppe_type = ppe["canonical_name"]

        # An item can only be assigned once, and one person gets one instance of each type
        if ppe_idx not in assigned_ppes and ppe_type not in assigned_ppe_types_per_person[p_idx]:
            assigned_ppes.add(ppe_idx)
            assigned_ppe_types_per_person[p_idx].add(ppe_type)
            person_ppe_map[p_idx].append(ppe)

    # Step 2: Handle Unclaimed PPE (Synthesize Workers if Person Detection was missed)
    unclaimed = [ppe for idx, ppe in enumerate(filtered_ppes) if idx not in assigned_ppes]
    if unclaimed:
        synthesized_workers = synthesize_workers_from_unclaimed_ppe(unclaimed, persons)
        for s_worker in synthesized_workers:
            s_idx = len(persons)
            persons.append(s_worker)
            person_ppe_map[s_idx] = []
            assigned_ppe_types_per_person[s_idx] = set()

            # Associate the unclaimed PPEs to the synthesized worker
            for ppe in unclaimed:
                ppe_type = ppe["canonical_name"]
                if ppe_type not in assigned_ppe_types_per_person[s_idx]:
                    sc = calculate_association_score(s_worker["bbox"], ppe["bbox"], ppe_type)
                    if sc > 0.0:
                        assigned_ppe_types_per_person[s_idx].add(ppe_type)
                        person_ppe_map[s_idx].append(ppe)

    # Step 3: Compute Compliance and Missing Elements for each Person
    results = []
    for p_idx, person in enumerate(persons):
        matched_ppes = person_ppe_map.get(p_idx, [])
        has_ppe = sorted(list(set(ppe["canonical_name"] for ppe in matched_ppes)))

        # Missing elements: required items that are NOT in has_ppe
        missing_ppe = [item for item in canonical_required if item not in has_ppe]

        status = "VIOLATION" if len(missing_ppe) > 0 else "COMPLIANT"
        violation_type = f"Missing: {', '.join(missing_ppe)}" if missing_ppe else "Compliant"

        total_req = len(canonical_required)
        compliance_score = round((total_req - len(missing_ppe)) / float(total_req), 2) if total_req > 0 else 1.0

        results.append({
            "person_bbox": [int(x) for x in person["bbox"]],
            "status": status,
            "missing_ppe": missing_ppe,
            "has_ppe": has_ppe,
            "violation_type": violation_type,
            "confidence": round(float(person.get("confidence", 0.8)), 3),
            "compliance_score": compliance_score,
        })

    return results
