import logging
import os
import smtplib
from email.message import EmailMessage

from config import settings

logger = logging.getLogger(__name__)


def _resolve_screenshot_path(screenshot_path) -> str | None:
    """Resolve screenshot_path (real filesystem path, relative path, or URL
    form '/screenshots/<name>') against settings.SCREENSHOT_DIR so the SMTP
    layer can attach the actual file. Returns None if the file isn't on disk."""
    if not screenshot_path:
        return None
    if os.path.exists(screenshot_path):
        return screenshot_path
    candidate = os.path.join(settings.SCREENSHOT_DIR, os.path.basename(str(screenshot_path)))
    if os.path.exists(candidate):
        return candidate
    return None


async def send_email_alert(violation_data, screenshot_path=None):
    if not settings.ENABLE_EMAIL_ALERTS:
        return False

    if not (settings.SMTP_USER and settings.SMTP_PASSWORD):
        logger.warning("[email] SMTP_USER or SMTP_PASSWORD not set, skipping send")
        return False

    try:
        msg = EmailMessage()
        missing = violation_data.get("missing_ppe", "Unknown")
        time_str = violation_data.get("timestamp", "Unknown")
        v_id = violation_data.get("id", "N/A")
        details = violation_data.get("details", "")

        msg["Subject"] = f"🚨 SafeGuard AI — PPE Violation Detected [Missing: {missing}]"
        msg["From"] = settings.ALERT_EMAIL_FROM or settings.SMTP_USER
        msg["To"] = settings.ALERT_EMAIL_TO

        content = (
            f"PPE VIOLATION DETECTED!\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Violation ID:  EV-{v_id}\n"
            f"Missing PPE:   {missing}\n"
            f"Timestamp:     {time_str}\n"
        )
        if details:
            content += f"Details:       {details}\n"
        content += (
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Please inspect the attached screenshot for visual evidence.\n"
            f"— SafeGuard AI Automated Alert System\n"
        )
        msg.set_content(content)

        # Resolve screenshot attachment
        resolved = _resolve_screenshot_path(screenshot_path) or _resolve_screenshot_path(
            violation_data.get("screenshot_path")
        )

        if resolved and os.path.exists(resolved):
            try:
                with open(resolved, "rb") as f:
                    img_data = f.read()
                    msg.add_attachment(
                        img_data,
                        maintype="image",
                        subtype="jpeg",
                        filename=os.path.basename(resolved),
                    )
            except Exception as e:
                logger.warning(f"[email] Could not attach screenshot {resolved}: {e}")

        # Send via SMTP with STARTTLS
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"[email] Alert sent successfully to {settings.ALERT_EMAIL_TO}")
        return True
    except Exception as e:
        logger.exception(f"[email] Failed to send alert: {e}")
        return False
