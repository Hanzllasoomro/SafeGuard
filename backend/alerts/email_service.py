"""
SafeGuard AI — Email alert delivery.

Sends an HTML email with the violation summary and (when available) the
annotated screenshot as an inline attachment. Three transport modes:

1. **Debug mode** (`settings.ALERT_DEBUG_MODE=true`) — uses
   `alerts.debug_receiver.log_alert` to write the message to a local log
   file. No SMTP traffic, no creds required. Used for development and
   tests.
2. **SMTP (TLS)** — Gmail/Outlook port 587, STARTTLS. Default.
3. **SMTP (SSL)** — port 465, implicit TLS. Used for providers that
   prefer it.

Earlier code had two bugs that this rewrite fixes:

- Screenshot `path` was checked with `os.path.exists()` on the URL form
  (`/screenshots/foo.jpg`), which is False on Windows, so attachments
  silently dropped. We now resolve the URL against `SCREENSHOT_DIR`.
- Failures returned `False` with no traceback, making debugging painful.
  We now log the full exception with `logger.exception(...)`.
"""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

from config import settings

logger = logging.getLogger(__name__)


def _resolve_screenshot_path(screenshot_path) -> str | None:
    """The callers pass either a real filesystem path or the public URL
    `/screenshots/<uuid>.jpg` (see `api/upload.py:99`). Resolve the URL form
    against `settings.SCREENSHOT_DIR` so the SMTP layer can attach the
    actual file. Returns `None` if the file isn't on disk."""
    if not screenshot_path:
        return None
    if os.path.exists(screenshot_path):
        return screenshot_path
    if isinstance(screenshot_path, str) and screenshot_path.startswith("/screenshots/"):
        candidate = os.path.join(settings.SCREENSHOT_DIR, os.path.basename(screenshot_path))
        if os.path.exists(candidate):
            return candidate
    return None


def _compose(violation_data: dict, screenshot_path: str | None) -> tuple[str, str, EmailMessage]:
    """Build the EmailMessage in one place so debug-mode and SMTP-mode send
    the same body."""
    missing = violation_data.get("missing_ppe", "Unknown")
    time_str = violation_data.get("timestamp", "Unknown")
    details = violation_data.get("details", "")
    subject = "🚨 SafeGuard AI — PPE Violation Detected"
    body = (
        "PPE Violation Detected!\n"
        f"Missing: {missing}\n"
        f"Time: {time_str}\n"
    )
    if details:
        body += f"Details: {details}\n"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.ALERT_EMAIL_FROM or settings.SMTP_USER
    msg["To"] = settings.ALERT_EMAIL_TO
    msg.set_content(body)

    resolved = _resolve_screenshot_path(screenshot_path)
    if resolved:
        try:
            with open(resolved, "rb") as f:
                msg.add_attachment(
                    f.read(),
                    maintype="image",
                    subtype="jpeg",
                    filename=os.path.basename(resolved),
                )
        except Exception as e:
            # Don't fail the whole send over an attachment problem; the
            # body is more important than the picture.
            logger.warning(f"[email] could not attach {resolved}: {e}")

    return subject, body, msg


def _send_via_smtp(msg: EmailMessage) -> None:
    """Open the SMTP connection using STARTTLS (587) or implicit TLS (465)
    based on the configured port. Raises on failure — caller decides how to
    log it."""
    host = settings.SMTP_HOST
    port = int(settings.SMTP_PORT)
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)


async def send_email_alert(violation_data: dict, screenshot_path=None) -> bool:
    """Send an email alert for one violation. Returns True on success, False
    otherwise. Logs every failure with a full traceback at WARNING level."""
    if not settings.ENABLE_EMAIL_ALERTS:
        return False

    try:
        subject, body, msg = _compose(violation_data, screenshot_path)

        if settings.ALERT_DEBUG_MODE:
            # Debug mode: write to the local log file instead of SMTP.
            # Useful when you want to verify the pipeline without creds.
            from alerts.debug_receiver import log_alert as debug_log
            debug_log(
                channel="email",
                payload={
                    "to": settings.ALERT_EMAIL_TO,
                    "from": settings.ALERT_EMAIL_FROM or settings.SMTP_USER,
                    "violation_id": violation_data.get("id"),
                    "missing_ppe": violation_data.get("missing_ppe"),
                    "screenshot": screenshot_path,
                },
                subject=subject,
                body=body,
            )
            logger.info(f"[email] debug-mode: logged alert for violation {violation_data.get('id')}")
            return True

        if not (settings.SMTP_USER and settings.SMTP_PASSWORD):
            logger.warning("[email] SMTP_USER / SMTP_PASSWORD not set — skipping send")
            return False

        _send_via_smtp(msg)
        logger.info(f"[email] sent alert for violation {violation_data.get('id')} to {settings.ALERT_EMAIL_TO}")
        return True
    except Exception:
        # Full traceback so the operator can see whether it's a creds
        # issue, an attachment problem, or a network blip.
        logger.exception("[email] failed to send alert")
        return False
