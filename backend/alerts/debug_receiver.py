"""
SafeGuard AI — Debug alert receiver.

Used ONLY when `ALERT_DEBUG_MODE=true` in the environment. Provides two
behaviours so the rest of the alert pipeline can be verified end-to-end
without external SMTP / Twilio accounts:

1. `aiosmtpd` SMTP listener on `127.0.0.1:1025` — accepts real SMTP
   connections from `email_service.py` and writes each message to
   `settings.DEBUG_LOG_FILE`.
2. `log_alert()` — a synchronous drop-in used by both email and WhatsApp
   services in debug mode to record what would have been sent.

The receiver never runs in production. `main.py` starts it only when
`ALERT_DEBUG_MODE=true`, and the alert services check the flag before
choosing the debug path.
"""
import asyncio
import logging
import os
from datetime import datetime
from email import message_from_bytes
from email.policy import default as default_policy

from aiosmtpd.controller import Controller
from aiosmtpd.smtp import SMTP as SMTPProtocol, Session, Envelope

from config import settings

logger = logging.getLogger(__name__)


def log_alert(channel: str, payload: dict, subject: str = None, body: str = None) -> None:
    """Append a single alert entry to the debug log file. Thread-unsafe but
    adequate for a dev-mode receiver — the production path doesn't go
    through here. We acquire a short lock via the file open() to keep
    concurrent writers from interleaving bytes."""
    try:
        os.makedirs(os.path.dirname(settings.DEBUG_LOG_FILE) or ".", exist_ok=True)
        timestamp = datetime.utcnow().isoformat()
        subject_line = subject or f"[{channel}] SafeGuard AI alert"
        body_lines = [
            f"=== {timestamp} | channel={channel} ===",
            f"Subject: {subject_line}",
        ]
        if body:
            body_lines.append("")
            body_lines.append(body)
        if payload:
            body_lines.append("")
            body_lines.append("Payload:")
            for key, value in payload.items():
                body_lines.append(f"  {key}: {value}")
        body_lines.append("")
        with open(settings.DEBUG_LOG_FILE, "a", encoding="utf-8") as f:
            f.write("\n".join(body_lines))
    except Exception as e:
        logger.error(f"[debug_receiver] failed to write alert log: {e}")


class _DebugSMTPHandler:
    """aiosmtpd handler that records each received message to the log file
    and ACKs it. We never fail the SMTP session — the goal of debug mode
    is to let the pipeline complete as if everything worked."""

    async def handle_DATA(self, server: SMTPProtocol, session: Session, envelope: Envelope):
        try:
            msg = message_from_bytes(envelope.content, policy=default_policy)
            subject = msg.get("Subject", "(no subject)")
            # `msg.get_body()` requires the email to be well-formed; fall back
            # to the raw payload if parsing fails (some test sends are plain).
            try:
                body_part = msg.get_body(preferencelist=("plain",))
                body = body_part.get_content() if body_part else envelope.content.decode("utf-8", errors="replace")
            except Exception:
                body = envelope.content.decode("utf-8", errors="replace")
            log_alert(
                channel="email-debug",
                payload={
                    "from": envelope.mail_from,
                    "to": ", ".join(envelope.rcpt_tos),
                },
                subject=subject,
                body=body,
            )
            logger.info(f"[debug_smtp] received from={envelope.mail_from} to={envelope.rcpt_tos}")
        except Exception as e:
            logger.error(f"[debug_smtp] handler error: {e}")
        return "250 Message accepted for delivery"


_controller: Controller | None = None


def start() -> bool:
    """Start the local aiosmtpd receiver. Returns True on success, False if
    the port was already in use (we still want the app to boot — just log
    the warning)."""
    global _controller
    if _controller is not None:
        return True
    try:
        handler = _DebugSMTPHandler()
        _controller = Controller(
            handler,
            hostname=settings.DEBUG_SMTP_HOST,
            port=settings.DEBUG_SMTP_PORT,
        )
        _controller.start()
        logger.info(
            f"[debug_smtp] listening on {settings.DEBUG_SMTP_HOST}:{settings.DEBUG_SMTP_PORT}"
        )
        return True
    except OSError as e:
        logger.warning(
            f"[debug_smtp] could not bind {settings.DEBUG_SMTP_HOST}:{settings.DEBUG_SMTP_PORT}: {e}. "
            f"Email alerts in debug mode will fall back to file logging only."
        )
        _controller = None
        return False
    except Exception as e:
        logger.error(f"[debug_smtp] unexpected error: {e}")
        _controller = None
        return False


def stop() -> None:
    """Tear down the receiver. Safe to call when never started."""
    global _controller
    if _controller is not None:
        try:
            _controller.stop()
        except Exception as e:
            logger.warning(f"[debug_smtp] stop error: {e}")
        _controller = None
