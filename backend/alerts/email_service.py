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
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

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


def _build_html_body(violation_data: dict, has_screenshot: bool = False) -> str:
    """Build a professional HTML email body for the violation alert."""
    missing = violation_data.get("missing_ppe", "Unknown")
    time_str = violation_data.get("timestamp", "Unknown")
    details = violation_data.get("details", "")
    confidence = violation_data.get("confidence", 0)
    person_count = violation_data.get("person_count", 0)
    violation_id = violation_data.get("id", "N/A")
    source = violation_data.get("source", "")

    # Build PPE badge list
    missing_items = [item.strip() for item in missing.split(",")] if missing else []
    ppe_badges = ""
    for item in missing_items:
        ppe_badges += f"""
            <span style="display:inline-block;padding:4px 12px;margin:2px 4px;
                         background:#FF2D3B;color:#fff;border-radius:20px;
                         font-size:12px;font-weight:600;letter-spacing:0.5px;">
                ⚠ {item.strip()}
            </span>"""

    screenshot_section = ""
    if has_screenshot:
        screenshot_section = """
        <tr>
          <td style="padding:16px 24px;">
            <p style="margin:0 0 8px;font-size:12px;color:#888;text-transform:uppercase;
                      letter-spacing:1px;font-weight:600;">Captured Screenshot</p>
            <img src="cid:violation_screenshot" alt="Violation Screenshot"
                 style="width:100%;max-width:560px;border-radius:8px;border:1px solid #333;" />
          </td>
        </tr>"""

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#0D0D0D;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D0D;padding:24px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0"
                   style="background:#1A1A1A;border-radius:12px;overflow:hidden;
                          border:1px solid #2A2A2A;box-shadow:0 4px 24px rgba(0,0,0,0.5);">

              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#FF2D3B 0%,#FF6B00 100%);
                           padding:24px 24px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;
                                   letter-spacing:-0.02em;">
                          🚨 PPE Violation Detected
                        </h1>
                        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px;">
                          SafeGuard AI — Automated Safety Compliance Alert
                        </p>
                      </td>
                      <td align="right" style="vertical-align:top;">
                        <span style="display:inline-block;background:rgba(255,255,255,0.2);
                                     color:#fff;padding:4px 10px;border-radius:6px;
                                     font-size:11px;font-weight:600;">
                          ID: EV-{violation_id}
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Alert Banner -->
              <tr>
                <td style="padding:20px 24px 12px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                         style="background:#2D1215;border:1px solid #FF2D3B;border-radius:8px;">
                    <tr>
                      <td style="padding:14px 16px;">
                        <p style="margin:0 0 6px;font-size:11px;color:#FF6B6B;
                                  text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">
                          MISSING PPE ITEMS
                        </p>
                        <div>{ppe_badges}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Details Grid -->
              <tr>
                <td style="padding:8px 24px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="padding:8px 8px 8px 0;">
                        <div style="background:#222;border-radius:8px;padding:12px 14px;
                                    border:1px solid #333;">
                          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;
                                    letter-spacing:1px;font-weight:600;">Timestamp</p>
                          <p style="margin:4px 0 0;font-size:14px;color:#E0E0E0;font-weight:600;">
                            {time_str}
                          </p>
                        </div>
                      </td>
                      <td width="50%" style="padding:8px 0 8px 8px;">
                        <div style="background:#222;border-radius:8px;padding:12px 14px;
                                    border:1px solid #333;">
                          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;
                                    letter-spacing:1px;font-weight:600;">Confidence</p>
                          <p style="margin:4px 0 0;font-size:14px;color:#FF6B00;font-weight:700;">
                            {round(float(confidence) * 100, 1) if confidence else 0}%
                          </p>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td width="50%" style="padding:8px 8px 8px 0;">
                        <div style="background:#222;border-radius:8px;padding:12px 14px;
                                    border:1px solid #333;">
                          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;
                                    letter-spacing:1px;font-weight:600;">Persons Detected</p>
                          <p style="margin:4px 0 0;font-size:14px;color:#E0E0E0;font-weight:600;">
                            {person_count}
                          </p>
                        </div>
                      </td>
                      <td width="50%" style="padding:8px 0 8px 8px;">
                        <div style="background:#222;border-radius:8px;padding:12px 14px;
                                    border:1px solid #333;">
                          <p style="margin:0;font-size:10px;color:#888;text-transform:uppercase;
                                    letter-spacing:1px;font-weight:600;">Source</p>
                          <p style="margin:4px 0 0;font-size:14px;color:#E0E0E0;font-weight:600;">
                            {details or source or 'N/A'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              {screenshot_section}

              <!-- Action Required -->
              <tr>
                <td style="padding:12px 24px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                         style="background:#1A2332;border:1px solid #2A4060;border-radius:8px;">
                    <tr>
                      <td style="padding:14px 16px;">
                        <p style="margin:0 0 4px;font-size:11px;color:#6BA3FF;
                                  text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">
                          ⚡ ACTION REQUIRED
                        </p>
                        <p style="margin:0;font-size:13px;color:#B0C4DE;line-height:1.5;">
                          Please ensure all personnel in the monitored area are wearing the
                          required PPE. Review the violation and take corrective action immediately.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding:16px 24px;border-top:1px solid #2A2A2A;">
                  <p style="margin:0;font-size:11px;color:#555;text-align:center;line-height:1.5;">
                    This is an automated alert from <strong style="color:#888;">SafeGuard AI</strong>
                    — Real-time PPE Detection &amp; Safety Compliance System.<br/>
                    To manage alert settings, visit the SafeGuard dashboard → Settings → Alert Routing.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """


def _compose(violation_data: dict, screenshot_path: str | None) -> tuple[str, str, MIMEMultipart]:
    """Build the MIME email in one place so debug-mode and SMTP-mode send
    the same body."""
    missing = violation_data.get("missing_ppe", "Unknown")
    violation_id = violation_data.get("id", "N/A")
    subject = f"🚨 SafeGuard AI — PPE Violation EV-{violation_id} | Missing: {missing}"

    resolved = _resolve_screenshot_path(screenshot_path)
    has_screenshot = resolved is not None

    html_body = _build_html_body(violation_data, has_screenshot=has_screenshot)

    # Plain-text fallback
    time_str = violation_data.get("timestamp", "Unknown")
    details = violation_data.get("details", "")
    plain_body = (
        "PPE Violation Detected!\n"
        f"Violation ID: EV-{violation_id}\n"
        f"Missing PPE: {missing}\n"
        f"Time: {time_str}\n"
    )
    if details:
        plain_body += f"Details: {details}\n"
    plain_body += "\n— SafeGuard AI Automated Alert\n"

    # Build MIME multipart message
    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = settings.ALERT_EMAIL_FROM or settings.SMTP_USER
    msg["To"] = settings.ALERT_EMAIL_TO

    # Attach HTML with plain-text fallback
    msg_alt = MIMEMultipart("alternative")
    msg_alt.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg_alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(msg_alt)

    # Inline screenshot attachment
    if resolved:
        try:
            with open(resolved, "rb") as f:
                img_data = f.read()
            img = MIMEImage(img_data, _subtype="jpeg")
            img.add_header("Content-ID", "<violation_screenshot>")
            img.add_header("Content-Disposition", "inline", filename=os.path.basename(resolved))
            msg.attach(img)
        except Exception as e:
            # Don't fail the whole send over an attachment problem; the
            # body is more important than the picture.
            logger.warning(f"[email] could not attach {resolved}: {e}")

    return subject, plain_body, msg


def _send_via_smtp(msg) -> None:
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


def _mark_alert_sent(violation_id) -> None:
    """Update the `alert_sent` flag on the Violation record so the dashboard
    can show which violations have been notified. Tolerates DB errors."""
    if violation_id is None:
        return
    try:
        from db.database import SessionLocal
        from db.models import Violation
        db = SessionLocal()
        try:
            v = db.query(Violation).filter(Violation.id == violation_id).first()
            if v:
                v.alert_sent = True
                db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("[email] failed to mark alert_sent flag")


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
            _mark_alert_sent(violation_data.get("id"))
            return True

        if not (settings.SMTP_USER and settings.SMTP_PASSWORD):
            logger.warning("[email] SMTP_USER / SMTP_PASSWORD not set — skipping send")
            return False

        _send_via_smtp(msg)
        logger.info(f"[email] sent alert for violation {violation_data.get('id')} to {settings.ALERT_EMAIL_TO}")
        _mark_alert_sent(violation_data.get("id"))
        return True
    except Exception:
        # Full traceback so the operator can see whether it's a creds
        # issue, an attachment problem, or a network blip.
        logger.exception("[email] failed to send alert")
        return False

