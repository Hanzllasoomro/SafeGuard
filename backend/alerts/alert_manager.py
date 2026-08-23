"""
SafeGuard AI — Alert fan-out orchestrator.

Decides which channels (email, WhatsApp) are enabled, checks throttling,
and dispatches each send in parallel. The throttle records the time of a
send **only after** the send returns success — this matters because if
the SMTP or Twilio call fails, operators still get a retry within the
configured cooldown instead of being silently blocked for the full window.

`trigger_alerts_test(channel)` is the lighter-weight path used by the
test endpoints. It builds a synthetic violation payload and routes through
the same send + log pipeline so the test exercises the real code path.
"""
import asyncio
import logging

from db.database import SessionLocal
from db.models import AlertLog
from alerts.throttle import throttle
from alerts.email_service import send_email_alert
from alerts.whatsapp_service import send_whatsapp_alert
from config import settings
from datetime import datetime

logger = logging.getLogger(__name__)


def _synthetic_violation() -> dict:
    """Build a fake violation payload for the test endpoints. Mirrors the
    shape that `api/upload.py` and `websocket/manager.py` pass to
    `trigger_alerts` so the test exercises the same code paths."""
    return {
        "id": None,
        "violation_type": "TEST: Missing: Helmet, Safety Vest",
        "missing_ppe": "Helmet, Safety Vest",
        "person_count": 1,
        "confidence": 0.95,
        "timestamp": datetime.utcnow().isoformat(),
        "details": "This is a test alert from the SafeGuard AI Settings panel.",
    }


async def _send_and_log(channel: str, send_func, violation_data: dict, screenshot_path=None) -> bool:
    """Send through one channel, write an AlertLog row, and return whether
    the send succeeded. The throttle is recorded ONLY on success so a
    transport hiccup doesn't lock out retries for the cooldown window."""
    try:
        if channel == "email":
            success = await send_func(violation_data, screenshot_path)
        else:
            success = await send_func(violation_data)
    except Exception as e:
        logger.error(f"[alert_manager] {channel} send raised: {e}")
        success = False

    if success:
        # Only NOW does the cooldown get marked. Earlier code recorded
        # before sending, so a single failure would burn the whole window.
        throttle.record_sent(channel)
        log_alert(channel, "success", violation_data.get("id") if isinstance(violation_data, dict) else None)
    else:
        log_alert(channel, "failed", violation_data.get("id") if isinstance(violation_data, dict) else None)
    return success


async def trigger_alerts(violation_data: dict, screenshot_path=None) -> dict:
    """Fan out one real violation to all enabled channels. Returns a dict
    keyed by channel with the per-channel success bool, so callers can log
    or surface what happened."""
    tasks = []

    if settings.ENABLE_EMAIL_ALERTS and throttle.can_send("email", settings.EMAIL_COOLDOWN_SECONDS):
        tasks.append(("email", send_email_alert, violation_data, screenshot_path))

    if settings.ENABLE_WHATSAPP_ALERTS and throttle.can_send("whatsapp", settings.WHATSAPP_COOLDOWN_SECONDS):
        tasks.append(("whatsapp", send_whatsapp_alert, violation_data, None))

    results = {}
    if tasks:
        outcomes = await asyncio.gather(
            *(_send_and_log(channel, fn, payload, ss) for channel, fn, payload, ss in tasks),
            return_exceptions=False,
        )
        for (channel, _, _, _), ok in zip(tasks, outcomes):
            results[channel] = ok
    return results


async def trigger_alerts_test(channel: str) -> dict:
    """Send a single test alert through one channel. Used by the Settings
    page test buttons. Bypasses throttle so the operator can re-trigger at
    will."""
    payload = _synthetic_violation()
    if channel == "email":
        # Send the test with no screenshot — keeps the test payload clean.
        ok = await _send_and_log("email", send_email_alert, payload, screenshot_path=None)
        transport = "debug" if settings.ALERT_DEBUG_MODE else "smtp"
    elif channel == "whatsapp":
        ok = await _send_and_log("whatsapp", send_whatsapp_alert, payload)
        transport = "debug" if settings.ALERT_DEBUG_MODE else "twilio"
    else:
        return {"ok": False, "message": f"Unknown channel: {channel}", "transport": "unknown"}

    message = "Sent" if ok else "Failed — check server logs for details."
    return {"ok": ok, "message": message, "transport": transport}


def log_alert(channel: str, status: str, violation_id=None) -> None:
    """Persist a row to the `alert_logs` table. Tolerates DB errors so a
    broken log write never crashes the alert pipeline."""
    try:
        db = SessionLocal()
        try:
            log = AlertLog(
                sent_at=datetime.utcnow(),
                channel=channel,
                status=status,
                violation_id=violation_id,
            )
            db.add(log)
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception(f"[alert_manager] failed to log {channel}/{status} to DB")
