"""
SafeGuard AI — FastAPI Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os, sys, logging

logger = logging.getLogger("uvicorn.error")

# Ensure backend dir is in path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import settings
from db.database import engine, Base, ensure_violation_columns
from api import health, upload, violations, stats
from api import settings as api_settings
from api import cameras
from websocket.manager import router as websocket_router

# Create database tables (fresh installs)
Base.metadata.create_all(bind=engine)

# Idempotent column-level migration for legacy safeguard.db files
# (no Alembic at this milestone — see db/database.py for details).
ensure_violation_columns(engine)

app = FastAPI(
    title="SafeGuard AI API",
    description="Real-time PPE Detection & Safety Compliance System",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure dirs exist
os.makedirs(settings.SCREENSHOT_DIR, exist_ok=True)

# Serve screenshots
app.mount("/screenshots", StaticFiles(directory=settings.SCREENSHOT_DIR), name="screenshots")

# Include routers
app.include_router(health.router)
app.include_router(upload.router)
app.include_router(violations.router)
app.include_router(stats.router)
app.include_router(api_settings.router)
app.include_router(cameras.router)
app.include_router(websocket_router)

@app.on_event("startup")
async def startup_event():
    print("=" * 50)
    print("  SafeGuard AI API -- Starting Up")
    print("=" * 50)
    print(f"  Model path:      {settings.MODEL_PATH}")
    print(f"  Database:        {settings.DATABASE_URL}")
    print(f"  Email alerts:    {'ON' if settings.ENABLE_EMAIL_ALERTS else 'OFF'}")
    print(f"  WhatsApp alerts: {'ON' if settings.ENABLE_WHATSAPP_ALERTS else 'OFF'}")
    print(f"  Screenshots:     {settings.SCREENSHOT_DIR}")
    if settings.ALERT_DEBUG_MODE:
        print(f"  Alert debug:     ON  -> {settings.DEBUG_SMTP_HOST}:{settings.DEBUG_SMTP_PORT}, log={settings.DEBUG_LOG_FILE}")
        # Start the local aiosmtpd receiver so email_service.py can deliver
        # to it. Failure to bind is logged but does not abort startup —
        # email_service.py will fall back to file-only logging.
        from alerts.debug_receiver import start as start_debug
        start_debug()
    else:
        print(f"  Alert debug:     OFF")
    print("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    if settings.ALERT_DEBUG_MODE:
        from alerts.debug_receiver import stop as stop_debug
        stop_debug()

@app.get("/")
async def root():
    return {"name": "SafeGuard AI", "version": "1.0.0", "status": "running"}
