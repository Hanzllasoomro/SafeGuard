# SafeGuard AI — Full Project Audit Report

> **Status:** Both servers running and tested ✅
> **Backend:** http://localhost:8000 — Model loaded, DB connected, all 5 API endpoints returning data
> **Frontend:** http://localhost:5173 — Compiling and rendering correctly

---

## ✅ What's Working Well

| Component | Status |
|-----------|--------|
| ONNX YOLOv8s model loading & inference | ✅ Working — detects Person, Helmet, Safety Vest, Face Mask |
| Image upload + detection pipeline | ✅ Working — returns annotated image + violation stats |
| Video upload + frame-by-frame analysis | ✅ Working — samples every 3rd frame, logs violations |
| Violation deduplication (cooldown) | ✅ Working — prevents duplicate logs per source |
| SQLite database + migrations | ✅ Working — auto-creates tables, handles legacy columns |
| WebSocket live stream architecture | ✅ Well-designed — async executor, multi-camera ready |
| Camera CRUD API | ✅ Working — add/edit/delete/test cameras |
| Alert system (Email + WhatsApp) | ✅ Wired — SMTP + Twilio with cooldown throttle |
| API client (Axios) | ✅ All endpoints correctly mapped |
| Dashboard live feed + camera selector | ✅ Working — real WS frames with bounding box overlays |

---

## 🔴 CRITICAL Issues (Must Fix)

### 1. "Export PDF Report" button DELETES all violations
[`ViolationsPage.jsx:296`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/ViolationsPage.jsx#L296)

```jsx
// CURRENT — clicking "Export PDF Report" runs clearViolations()!
onClick={() => { if (window.confirm('Clear all violations?')) clearViolations().then(fetchViolations); }}
```

The button says **"Export PDF Report"** but its `onClick` handler calls `clearViolations()`, which **permanently deletes every violation** from the database. A user clicking "Export" expecting a PDF will lose all their data instead.

**Fix:** Rename the button to "Clear All Violations" or implement actual PDF export using `jspdf` (already in `package.json`).

---

### 2. Dashboard shows fake/hardcoded data when no violations exist
[`DashboardPage.jsx:389-390`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/DashboardPage.jsx#L389) and [`DashboardPage.jsx:427-429`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/DashboardPage.jsx#L427)

```jsx
// Shows "128" workers even when the real value is 0
<StatTile label="WORKERS DETECTED" value={stats.total_persons_detected || 128} />
<StatTile label="ACTIVE ALERTS" value={activeAlerts || stats.today_violations || 3} accent />

// Shows fake incidents when there are none
<IncidentItem type="MISSING PPE (MASK)" camera="CAM-01 [Z-BAY]" confidence={88} time="14:32:01" />
```

When there's no real data, the dashboard falls back to **hardcoded fake numbers** (128 workers, 3 alerts) and **fake incident entries**. This is misleading — during a demo or defense, evaluators would see fabricated data.

**Fix:** Show `0` for real values and "No recent incidents" for empty lists.

---

### 3. Compliance Rate and Workers Detected are always 0
[`stats.py:25-26`](file:///i:/AntiGRavity/SafeGuard/backend/api/stats.py#L25)

```python
# Backend always returns 0 for these
total_persons_detected = 0
compliance_rate = 0.0
```

The backend intentionally hardcodes these to `0` because it only tracks violations, not total detections. Combined with Issue #2 (fallback to `128`), the dashboard never shows real worker counts.

**Fix:** Track total persons per upload in the `Violation` table or create a new `DetectionEvent` table to log every detection (not just violations).

---

## 🟠 HIGH Issues

### 4. Navbar links are broken `<a href="#">`
[`Navbar.jsx:22-29`](file:///i:/AntiGRavity/SafeGuard/frontend/src/components/layout/Navbar.jsx#L22)

The top navigation links ("Live View", "Analysis", "Archives") use plain `<a href="#">` instead of React Router's `<Link>` or `<NavLink>`. Clicking them scrolls to the top of the page and breaks SPA navigation.

**Fix:** Replace with `<NavLink to="/...">` components pointing to the correct routes.

---

### 5. "Archive Evidence" and "Export CSV" buttons do nothing
[`ViolationsPage.jsx:286-293`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/ViolationsPage.jsx#L286)

Both buttons in the violations table header have no `onClick` handlers. Users click them and nothing happens.

**Fix:** Wire up CSV export (generate and download a `.csv` file) and either implement archiving or remove the button.

---

### 6. Pagination only shows pages 1-5, breaks after page 5
[`ViolationsPage.jsx:384`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/ViolationsPage.jsx#L384)

```jsx
// Always renders pages 1 through min(totalPages, 5)
{Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(...)}
```

If there are more than 5 pages, the user can click NEXT to reach page 6+, but the page button won't be visible. The active page indicator disappears.

**Fix:** Dynamically calculate the visible page window based on the current page number.

---

### 7. API errors are silently swallowed
[`ViolationsPage.jsx:160`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/ViolationsPage.jsx#L160) and [`DashboardPage.jsx:195`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/DashboardPage.jsx#L195)

Both pages catch API errors and silently ignore them. If the backend is down, the user sees an empty page with no indication that something is wrong.

**Fix:** Add an `error` state and display a visible error banner when API calls fail.

---

### 8. System Load bars show hardcoded fake values
[`DashboardPage.jsx:402-403`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/DashboardPage.jsx#L402)

```jsx
<MiniBar label="GPU 0 (Orin)" value={82} color="#FF6B00" />
<MiniBar label="CPU" value={45} color="#44DCEA" />
```

These always show GPU 82% and CPU 45% regardless of actual system load. Misleading during a demo.

**Fix:** Either fetch real system metrics from a `/api/stats/system` endpoint using `psutil`, or label these as "N/A" / hide them.

---

## 🟡 MEDIUM Issues

### 9. ViolationModal buttons are non-functional
[`ViolationsPage.jsx:103-109`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/ViolationsPage.jsx#L103)

"Mark False Positive" and "Export to Incident Report" buttons in the detail modal have no handlers.

### 10. "Acknowledge" and "Escalate" buttons don't work
[`DashboardPage.jsx:81-88`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/DashboardPage.jsx#L81)

Incident log items show "Acknowledge" and "Escalate" buttons with no click handlers.

### 11. Upload error returns 200 instead of 400
[`upload.py:65`](file:///i:/AntiGRavity/SafeGuard/backend/api/upload.py#L65)

```python
return {"error": "Could not read image file"}  # Returns HTTP 200 with error in body
```

Should raise `HTTPException(status_code=400, detail="Could not read image file")`.

### 12. Camera tiles CAM-02/03/04 are hardcoded placeholders
[`DashboardPage.jsx:367-373`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/DashboardPage.jsx#L367)

Three camera tiles are hardcoded with fake names. Should be dynamically populated from the cameras API.

### 13. Settings "Coming Soon" tabs
[`SettingsPage.jsx:425`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/SettingsPage.jsx#L425)

"Alert Routing", "User RBAC", and "System Logs" tabs show placeholder text.

### 14. Drag-and-drop upload zone not keyboard accessible
[`UploadPage.jsx:189`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/UploadPage.jsx#L189)

Missing `role="button"`, `tabIndex={0}`, and keyboard event handlers for accessibility.

---

## 🔵 LOW Issues

### 15. Toggle component missing ARIA attributes
[`Toggle.jsx`](file:///i:/AntiGRavity/SafeGuard/frontend/src/components/ui/Toggle.jsx) — Missing `role="switch"` and `aria-checked`.

### 16. Layout not responsive on mobile
[`App.jsx:22-31`](file:///i:/AntiGRavity/SafeGuard/frontend/src/App.jsx#L22) — Hardcoded sidebar margin breaks on small screens.

### 17. PTZ camera controls are decorative
[`DashboardPage.jsx:357-363`](file:///i:/AntiGRavity/SafeGuard/frontend/src/pages/DashboardPage.jsx#L357) — Zoom/pan buttons do nothing.

### 18. No file size/type validation on upload
[`upload.py:47-59`](file:///i:/AntiGRavity/SafeGuard/backend/api/upload.py#L47) — Any file type/size accepted. Should validate MIME type and set a max size.

---

## 💡 Strategic Suggestions (3-Month Roadmap)

These are features that would significantly elevate your FYP grade:

### 1. 📊 Analytics Charts Page (Week 1-2)
Add a dedicated `/analytics` page with `recharts` (already installed) showing:
- Violations over time (line chart)
- Violations by PPE type (bar chart — Helmet vs Vest vs Mask)
- Compliance rate trend
- Peak violation hours (heatmap)

*The backend already returns `violations_by_type` in the stats API — you just need to visualize it.*

### 2. 📄 PDF Report Generation (Week 2-3)
Add `/api/violations/report/pdf` using `fpdf2`:
- Cover page with date range and summary stats
- Violation table with thumbnails
- Charts embedded as images
- Downloadable from the Violations page

### 3. 🔐 JWT Authentication (Week 3-5)
- Login screen with username/password
- JWT tokens stored in localStorage
- Role-based access (Admin can clear data, Viewer can only view)
- Protects all API routes

### 4. 📱 Mobile Responsive Layout (Week 5-6)
- Collapsible sidebar hamburger menu
- Stacking camera grid on mobile
- Touch-friendly violation table

### 5. 🎯 Object Tracking (DeepSORT) (Week 6-8)
- Assign persistent IDs to workers across frames
- One violation per worker per incident instead of per frame
- Show worker movement paths on the live feed

### 6. 📧 Real Email/WhatsApp Integration Testing (Week 8-9)
- Set up a real Gmail App Password for email alerts
- Configure Twilio Sandbox for WhatsApp
- Demo live alerts during the FYP defense
