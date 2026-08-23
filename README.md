# SafeGuard AI — PPE Detection & Safety Compliance System

SafeGuard AI is a real-time Personal Protective Equipment (PPE) detection and safety compliance dashboard built for industrial workspaces. It runs a custom-trained YOLOv8s model (ONNX) to detect workers and flag safety violations — missing helmets, vests, or face masks — with instant email and WhatsApp alerts.

**Stack:** FastAPI (Python) · React + Vite (JavaScript) · SQLite · ONNX Runtime · WebSocket

---

## Features

- **Real-time YOLOv8s Inference** — detects `Person`, `Helmet`, `Safety Vest`, `Face Mask` via WebSocket stream
- **Compliance Logic** — IoU-based PPE→person association with per-class thresholds
- **Instant Alerts** — Email (SMTP) and WhatsApp (Twilio) with smart cooldown throttling
- **Interactive Dashboard** — live compliance rate, worker count, violations feed, stream viewer
- **Upload Analysis** — frame-by-frame detection on images/videos with downloadable annotated output
- **Violation History** — filterable logs, CSV export

---

## Project Structure

```
SafeGuard/
├── backend/
│   ├── alerts/           # Email & WhatsApp alert services
│   ├── api/              # REST endpoints (/health, /upload, /violations, /stats, /cameras)
│   ├── db/               # SQLAlchemy models & SQLite engine
│   ├── detection/        # YOLOv8s ONNX inference & CV2 frame annotator
│   ├── websocket/        # WebSocket live stream controller
│   ├── best.onnx         # Pre-trained YOLOv8s model (42 MB)
│   ├── main.py           # FastAPI entry point
│   ├── config.py         # Settings loaded from .env
│   ├── requirements.txt  # Python dependencies
│   └── .env.example      # Environment template — copy to .env
│
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios API client
│   │   ├── components/   # Sidebar, Navbar, shared UI
│   │   ├── pages/        # Dashboard, Violations, Upload, Settings
│   │   └── App.jsx       # Router & app shell
│   ├── vite.config.js    # Dev server + API proxy (→ localhost:8000)
│   └── package.json
│
├── start.bat             # One-click launcher (Windows)
├── start.sh              # One-click launcher (Linux/macOS)
├── package.json          # Root — concurrently dev script
└── .gitignore
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10 or newer |
| Node.js | 18.x or newer |
| npm | 9.x or newer |

---

## Quick Start (Recommended)

### Option A — Single command (uses `concurrently`)

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd SafeGuard

# 2. Install root dev tools (just concurrently)
npm install

# 3. Install frontend dependencies
npm run setup

# 4. Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env if needed (see Environment Variables below)

# 5. Install Python dependencies
cd backend
pip install -r requirements.txt
cd ..

# 6. Start both servers
npm run dev
```

The terminal will show colored output from both servers:
- 🟦 **BACKEND** → `http://localhost:8000` · API docs at `/docs`
- 🟣 **FRONTEND** → `http://localhost:5173`

---

### Option B — Windows one-click batch script

```bat
start.bat
```

Opens two separate terminal windows — one for the backend, one for the frontend.

---

### Option C — Linux / macOS shell script

```bash
chmod +x start.sh
./start.sh
```

Runs both servers as background processes and traps `Ctrl+C` to stop them cleanly.

---

### Option D — Manual (two terminals)

**Terminal 1 — Backend:**
```bash
cd backend
# (optional) activate your venv:
#   Windows: venv\Scripts\activate
#   Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and adjust as needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | `8000` | FastAPI server port |
| `CONFIDENCE_THRESHOLD` | `0.5` | YOLO detection confidence cutoff |
| `DATABASE_URL` | `sqlite:///./safeguard.db` | Database connection string |
| `ENABLE_EMAIL_ALERTS` | `false` | Enable email notifications |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server host |
| `SMTP_USER` | _(empty)_ | Gmail / SMTP username |
| `SMTP_PASSWORD` | _(empty)_ | Gmail App Password |
| `ALERT_EMAIL_TO` | _(empty)_ | Recipient email address |
| `ENABLE_WHATSAPP_ALERTS` | `false` | Enable WhatsApp notifications |
| `TWILIO_ACCOUNT_SID` | _(empty)_ | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | _(empty)_ | Twilio auth token |
| `ALERT_WHATSAPP_TO` | _(empty)_ | Recipient WhatsApp number (e.g. `+92...`) |
| `ALERT_DEBUG_MODE` | `false` | Dev mode — routes alerts to local log file |

---

## Alert Setup

### Email (Gmail SMTP)
1. Enable 2-Step Verification on your Google Account
2. Go to **Google Account → Security → App Passwords**, create a password for "Mail"
3. Set in `.env`:
   ```
   ENABLE_EMAIL_ALERTS=true
   SMTP_USER=your@gmail.com
   SMTP_PASSWORD=your_app_password
   ALERT_EMAIL_FROM=your@gmail.com
   ALERT_EMAIL_TO=recipient@example.com
   ```

### WhatsApp (Twilio Sandbox)
1. Create a free [Twilio](https://www.twilio.com) account
2. Join the WhatsApp Sandbox and verify your number
3. Set in `.env`:
   ```
   ENABLE_WHATSAPP_ALERTS=true
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   ALERT_WHATSAPP_TO=+923001234567
   ```

---

## Connecting to a Remote Backend

If the backend runs on a different machine (e.g., a server at `192.168.1.10`):

```bash
VITE_BACKEND_URL=http://192.168.1.10:8000 npm run dev
```

Also add that origin to `ALLOWED_ORIGINS` in `backend/.env`:
```
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.10:5173
```

---

## API Reference

Interactive Swagger UI: `http://localhost:8000/docs`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/cameras` | GET | List configured cameras |
| `/api/cameras/auto-detect` | GET | Auto-detect local cameras |
| `/api/violations` | GET | Paginated violation history |
| `/api/stats/dashboard` | GET | Dashboard stats |
| `/api/upload` | POST | Upload image/video for analysis |
| `/ws/stream/{camera_id}` | WS | Live detection stream |
