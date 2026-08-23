import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db.database import get_db
from db.models import AlertSettings
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

class AlertSettingsUpdate(BaseModel):
    email_enabled: bool
    whatsapp_enabled: bool
    email_recipients: str
    whatsapp_recipient: str
    email_cooldown: int
    whatsapp_cooldown: int
    confidence_threshold: float

@router.get("/api/settings/alerts")
def get_alert_settings(db: Session = Depends(get_db)):
    db_settings = db.query(AlertSettings).first()
    if not db_settings:
        return {
            "email_enabled": settings.ENABLE_EMAIL_ALERTS,
            "whatsapp_enabled": settings.ENABLE_WHATSAPP_ALERTS,
            "email_recipients": settings.ALERT_EMAIL_TO,
            "whatsapp_recipient": settings.ALERT_WHATSAPP_TO,
            "email_cooldown": settings.EMAIL_COOLDOWN_SECONDS,
            "whatsapp_cooldown": settings.WHATSAPP_COOLDOWN_SECONDS,
            "confidence_threshold": settings.CONFIDENCE_THRESHOLD
        }
    return db_settings

@router.put("/api/settings/alerts")
def update_alert_settings(update_data: AlertSettingsUpdate, db: Session = Depends(get_db)):
    db_settings = db.query(AlertSettings).first()
    if not db_settings:
        db_settings = AlertSettings()
        db.add(db_settings)
        
    db_settings.email_enabled = update_data.email_enabled
    db_settings.whatsapp_enabled = update_data.whatsapp_enabled
    db_settings.email_recipients = update_data.email_recipients
    db_settings.whatsapp_recipient = update_data.whatsapp_recipient
    db_settings.email_cooldown = update_data.email_cooldown
    db_settings.whatsapp_cooldown = update_data.whatsapp_cooldown
    db_settings.confidence_threshold = update_data.confidence_threshold
    
    db.commit()
    db.refresh(db_settings)
    
    # Update runtime settings
    settings.ENABLE_EMAIL_ALERTS = update_data.email_enabled
    settings.ENABLE_WHATSAPP_ALERTS = update_data.whatsapp_enabled
    settings.ALERT_EMAIL_TO = update_data.email_recipients
    settings.ALERT_WHATSAPP_TO = update_data.whatsapp_recipient
    settings.EMAIL_COOLDOWN_SECONDS = update_data.email_cooldown
    settings.WHATSAPP_COOLDOWN_SECONDS = update_data.whatsapp_cooldown
    settings.CONFIDENCE_THRESHOLD = update_data.confidence_threshold

    return db_settings


@router.post("/api/settings/alerts/test-email")
async def test_email_alert():
    """Send a test email through the same code path as a real violation.
    Returns {ok, message, transport}. Bypasses cooldown so the operator
    can re-trigger at will."""
    from alerts.alert_manager import trigger_alerts_test
    if not settings.ENABLE_EMAIL_ALERTS:
        return {
            "ok": False,
            "message": "Email alerts are disabled in Settings — enable them first.",
            "transport": "none",
        }
    try:
        result = await trigger_alerts_test("email")
    except Exception as e:
        logger.exception("[api.settings] test email failed")
        return {"ok": False, "message": f"Failed: {e}", "transport": "none"}
    if result["transport"] == "debug":
        result["message"] = "Sent via local debug receiver — check the alert debug log."
    return result


@router.post("/api/settings/alerts/test-whatsapp")
async def test_whatsapp_alert():
    """Send a test WhatsApp message through the same code path as a real
    violation. Returns {ok, message, transport}. Bypasses cooldown."""
    from alerts.alert_manager import trigger_alerts_test
    if not settings.ENABLE_WHATSAPP_ALERTS:
        return {
            "ok": False,
            "message": "WhatsApp alerts are disabled in Settings — enable them first.",
            "transport": "none",
        }
    try:
        result = await trigger_alerts_test("whatsapp")
    except Exception as e:
        logger.exception("[api.settings] test whatsapp failed")
        return {"ok": False, "message": f"Failed: {e}", "transport": "none"}
    if result["transport"] == "debug":
        result["message"] = "Sent via local debug receiver — check the alert debug log."
    return result
