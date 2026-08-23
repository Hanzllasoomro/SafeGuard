# SafeGuard AI — Frontend ↔ Backend API Contract

This document describes every API call made by the redesigned frontend, including all **new fields** introduced by the Stitch design implementation. Use this as your authoritative reference for updating backend schemas and endpoints.

---

## Design Conventions

| Convention | Value |
|---|---|
| Base URL | `/api` |
| Date format | ISO-8601 UTC — `2024-01-25T14:32:11Z` |
| Confidence | Float 0.0–1.0 (frontend multiplies by 100 for display) |
| Pagination | `page` (1-based) + `per_page` query params; response includes `total` |

---

## 1. Dashboard — `GET /api/stats/dashboard`

Used by **DashboardPage** to populate KPI widgets and the incident log.

### Response Schema
```json
{
  "total_violations":        "integer",
  "today_violations":        "integer",
  "total_persons_detected":  "integer",
  "compliance_rate":         "number (0-100, percentage)",
  "avg_confidence":          "number (0-100, percentage)",
  "recent_violations": [
    {
      "id":             "integer",
      "violation_type": "string",
      "confidence":     "float (0.0-1.0)",
      "timestamp":      "ISO-8601 string",
      "camera_id":      "string | null",
      "camera_name":    "string | null",
      "location_name":  "string | null",
      "resolved":       "boolean"
    }
  ]
}
```

### New Fields Required
| Field | Type | Notes |
|---|---|---|
| `recent_violations[].resolved` | `boolean` | `false` = active alert (red border), `true` = greyed-out in incident log |
| `recent_violations[].location_name` | `string \| null` | Human-readable zone, e.g. "Sector 7G" |
| `recent_violations[].camera_name` | `string \| null` | Camera display name shown in incident log |

---

## 2. Violations List — `GET /api/violations`

Used by **ViolationsPage** for the paginated data table with filter sidebar.

### Query Parameters
| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | integer | 1 | 1-based page number |
| `per_page` | integer | 20 | Records per page |
| `date_from` | string | — | ISO-8601 or `YYYY-MM-DD HH:mm`, inclusive |
| `date_to` | string | — | ISO-8601 or `YYYY-MM-DD HH:mm`, inclusive |
| `violation_type` | string | — | Exact match, e.g. `"Missing Helmet"` |
| `camera_id` | string | — | Filter by camera ID string, e.g. `"CAM-01"` |
| `location` | string | — | Filter by location/zone name |

### Response Schema
```json
{
  "violations": [
    {
      "id":                 "integer",
      "violation_type":     "string",
      "confidence":         "float (0.0-1.0)",
      "timestamp":          "ISO-8601 string",
      "camera_id":          "string | null",
      "camera_name":        "string | null",
      "location_name":      "string | null",
      "evidence_image_url": "string | null",
      "resolved":           "boolean"
    }
  ],
  "total":    "integer",
  "page":     "integer",
  "per_page": "integer"
}
```

### New Fields Required
| Field | Type | Notes |
|---|---|---|
| `evidence_image_url` | `string \| null` | URL to the violation snapshot thumbnail. Displayed 64×48px in table. Can be a relative `/media/…` path or full URL. |
| `location_name` | `string \| null` | Human-readable zone label (shown below camera_id in table) |
| `camera_name` | `string \| null` | Display name of camera |
| `resolved` | `boolean` | Whether the violation has been acknowledged |

---

## 3. Violation Detail — `GET /api/violations/{id}`

Used by the **ViolationsPage** detail modal when a row is clicked.

### Response Schema
```json
{
  "id":                 "integer",
  "violation_type":     "string",
  "confidence":         "float (0.0-1.0)",
  "timestamp":          "ISO-8601 string",
  "camera_id":          "string | null",
  "camera_name":        "string | null",
  "location_name":      "string | null",
  "evidence_image_url": "string | null",
  "bounding_boxes": [
    {
      "class":      "string",
      "confidence": "float",
      "x": "float", "y": "float",
      "width": "float", "height": "float"
    }
  ],
  "resolved": "boolean"
}
```

### New Fields Required
| Field | Type | Notes |
|---|---|---|
| `evidence_image_url` | `string \| null` | Full-resolution image shown in modal |
| `bounding_boxes` | `array` | Optional AI detection overlay data (future use) |

---

## 4. Cameras List — `GET /api/cameras`

Used by **CamerasPage** to populate the camera card grid.

### Response Schema
```json
[
  {
    "id":           "integer",
    "name":         "string",
    "source_type":  "string (webcam | rtsp | ip)",
    "url":          "string | null",
    "location":     "string | null",
    "enabled":      "boolean",
    "resolution":   "string | null",
    "frame_rate":   "string | null",
    "ptz_enabled":  "boolean",
    "presets": [
      { "name": "string", "position": "any" }
    ]
  }
]
```

### New Fields Required
| Field | Type | Notes |
|---|---|---|
| `resolution` | `string \| null` | e.g. `"1920x1080"`, `"1280x720"`, `"640x480"`. Displayed as badge on camera card thumbnail. |
| `frame_rate` | `string \| null` | e.g. `"30"`, `"15"`, `"5"`. Displayed as fps badge on thumbnail. |
| `ptz_enabled` | `boolean` | Whether PTZ control panel shows in config. Defaults to `false`. |
| `presets` | `array` | Named PTZ positions (currently display only, future: send preset commands). |

---

## 5. Camera Create — `POST /api/cameras`

### Request Body
```json
{
  "name":        "string (required)",
  "source_type": "webcam | rtsp | ip",
  "url":         "string | null",
  "username":    "string | null",
  "password":    "string | null",
  "location":    "string | null",
  "enabled":     "boolean",
  "resolution":  "string | null",
  "frame_rate":  "string | null",
  "ptz_enabled": "boolean"
}
```

**Response:** Single camera object (same schema as list item above).

---

## 6. Camera Update — `PUT /api/cameras/{id}`

Same request body as Create. All fields optional.

---

## 7. Camera Test — `POST /api/cameras/{id}/test`

No change. Returns: `{ "ok": boolean, "message": string }`

---

## 8. Camera Delete — `DELETE /api/cameras/{id}`

No change. Returns `204 No Content`.

---

## 9. Camera Local Scan — `GET /api/cameras/scan-local`

No change from existing implementation.
Query param: `max_index` (integer, default 4).

---

## 10. Upload Image — `POST /api/upload/image`

Used by **UploadPage**. Multipart form data.

### Request
```
Content-Type: multipart/form-data

file:       <binary image file>
model:      "yolov8s" | "yolov8m" | "yolov8n"   (NEW)
confidence: float string, e.g. "0.70"             (NEW)
classes:    JSON array string, e.g. '["Personnel","PPE (Hardhat/Vest)"]'  (NEW)
```

### Response Schema
```json
{
  "violations": [
    {
      "violation_type": "string",
      "confidence":     "float (0.0-1.0)",
      "bounding_box":   { "x": "float", "y": "float", "width": "float", "height": "float" }
    }
  ],
  "persons_detected":  "integer",
  "inference_time_ms": "integer | null",
  "model":             "string",
  "result_image_url":  "string | null"
}
```

### New Fields Required
| Field | Notes |
|---|---|
| `persons_detected` | Count shown in detection result card |
| `inference_time_ms` | Model latency shown in result card |
| `model` | Name of model used (echoed back) |
| `result_image_url` | URL to annotated output image (optional but recommended) |

---

## 11. Upload Video — `POST /api/upload/video`

Same new request fields as image upload.

### Response Schema
```json
{
  "violations":       "array (same as image)",
  "persons_detected": "integer",
  "inference_time_ms":"integer | null",
  "model":            "string",
  "frames_processed": "integer | null",
  "result_video_url": "string | null"
}
```

---

## 12. Settings Read — `GET /api/settings/alerts`

Used by **SettingsPage** on load.

### Response Schema
```json
{
  "email_enabled":        "boolean",
  "email_recipients":     "string[]",
  "email_cooldown":       "integer (seconds)",
  "whatsapp_enabled":     "boolean",
  "whatsapp_recipient":   "string | null",
  "whatsapp_cooldown":    "integer (seconds)",
  "confidence_threshold": "float (0.0-1.0)"
}
```

> **Note:** `always_required_ppe` is currently hardcoded on the frontend as `["Safety Helmet", "High-Visibility Vest", "Face Mask"]`. Add this field to the response if you want backend control.

---

## 13. Settings Update — `PUT /api/settings/alerts`

### Request Body
```json
{
  "email_enabled":        "boolean",
  "email_recipients":     "string[]",
  "email_cooldown":       "integer",
  "whatsapp_enabled":     "boolean",
  "whatsapp_recipient":   "string | null",
  "whatsapp_cooldown":    "integer",
  "confidence_threshold": "float (0.0-1.0)"
}
```

**Response:** `{ "status": "ok" }` or updated settings object.

---

## 14. Violations Clear — `DELETE /api/violations`

Used by Export PDF / Archive button on ViolationsPage. No change from existing.

---

## 15. WebSocket Live Stream — `ws://{host}/ws/stream/{camera_id}`

Used by **DashboardPage** live feed. Camera ID from camera selector.

### Existing Frame Message (still supported)
```json
{ "frame": "<base64-encoded JPEG string>" }
```

### Recommended Enhanced Format (new)
```json
{
  "frame": "<base64-encoded JPEG string>",
  "detections": [
    {
      "class":      "helmet | vest | nomask | person | vehicle",
      "confidence": "float (0.0-1.0)",
      "x_pct":      "float (0.0-1.0, left edge %)",
      "y_pct":      "float (0.0-1.0, top edge %)",
      "w_pct":      "float (0.0-1.0, width %)",
      "h_pct":      "float (0.0-1.0, height %)"
    }
  ],
  "alert": "boolean"
}
```

> Adding `detections` enables the frontend to render real bounding box overlays over live frames instead of static sample boxes.

---

## Complete New Fields Summary

| Page | Endpoint | New Field | Type | Priority |
|---|---|---|---|---|
| Dashboard | `GET /stats/dashboard` | `recent_violations[].resolved` | bool | **High** |
| Dashboard | `GET /stats/dashboard` | `recent_violations[].location_name` | string | Medium |
| Dashboard | `GET /stats/dashboard` | `recent_violations[].camera_name` | string | Medium |
| Violations | `GET /violations` | `evidence_image_url` | string | **High** |
| Violations | `GET /violations` | `location_name` | string | **High** |
| Violations | `GET /violations` | `camera_name` | string | Medium |
| Violations | `GET /violations` | `resolved` | bool | Medium |
| Violations Detail | `GET /violations/{id}` | `evidence_image_url` | string | **High** |
| Violations Detail | `GET /violations/{id}` | `bounding_boxes` | array | Low |
| Cameras | `GET/POST/PUT /cameras` | `resolution` | string | **High** |
| Cameras | `GET/POST/PUT /cameras` | `frame_rate` | string | **High** |
| Cameras | `GET/POST/PUT /cameras` | `ptz_enabled` | bool | Medium |
| Cameras | `GET/PUT /cameras` | `presets` | array | Low |
| Upload | `POST /upload/image` | `model` (request) | string | **High** |
| Upload | `POST /upload/image` | `confidence` (request) | float | **High** |
| Upload | `POST /upload/*` | `persons_detected` | int | Medium |
| Upload | `POST /upload/*` | `inference_time_ms` | int | Medium |
| Upload | `POST /upload/*` | `model` (response) | string | Medium |
| Upload | `POST /upload/image` | `result_image_url` | string | Low |
| WebSocket | `ws://…/stream/{id}` | `detections` array | array | Low |
