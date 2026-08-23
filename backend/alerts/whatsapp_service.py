"""
SafeGuard AI — WhatsApp alert delivery via Twilio.

In debug mode (`settings.ALERT_DEBUG_MODE=true`) the message is written to
the local debug log file instead of being sent through Twilio. This lets
us verify the full pipeline end-to-end without a Twilio account.

In production, we use the Twilio REST API. `twilio` is listed in
`requirements.txt`; if it's not installed we log a clear actionable error
and return False (the alert manager will record the failure in AlertLog).
"""
import logging

from config import settings

logger = logging.getLogger(__name__)


def _build_message_body(violation_data: dict) -> str:
    missing = violation_data.get("missing_ppe", "Unknown")
    time_str = violation_data.get("timestamp", "Unknown")
    details = violation_data.get("details", "")
    body = (
        "SafeGuard AI — PPE VIOLATION DETECTED\n"
        f"Timestamp: {time_str}\n"
        f"Missing PPE: {missing}\n"
        f"Worker Count: {violation_data.get('person_count', 1)}\n"
    )
    if details:
        body += f"Details: {details}\n"
    return body


async def send_whatsapp_alert(
    violation_data: dict,
    to_number: str = None,
    bypass_enabled_check: bool = False,
) -> bool:
    """Send a WhatsApp alert. Returns True on success, False on any
    failure. Logs every failure with a full traceback so operators can
    diagnose without re-running the violation.

    Args:
        violation_data:        The violation payload dict.
        to_number:             Override the global ALERT_WHATSAPP_TO recipient.
                               Useful for manual admin shares to a custom number.
        bypass_enabled_check:  When True, skip the ENABLE_WHATSAPP_ALERTS gate
                               so manual shares still work even if automatic
                               WhatsApp alerts are globally disabled.
    """
    if not bypass_enabled_check and not settings.ENABLE_WHATSAPP_ALERTS:
        return False

    # Resolve the destination number — caller-supplied takes precedence.
    destination = to_number or settings.ALERT_WHATSAPP_TO

    try:
        body = _build_message_body(violation_data)

        if settings.ALERT_DEBUG_MODE:
            from alerts.debug_receiver import log_alert as debug_log
            debug_log(
                channel="whatsapp",
                payload={
                    "from": f"whatsapp:{settings.TWILIO_WHATSAPP_FROM}",
                    "to": f"whatsapp:{destination}",
                    "violation_id": violation_data.get("id"),
                    "missing_ppe": violation_data.get("missing_ppe"),
                },
                subject="SafeGuard AI — PPE VIOLATION DETECTED",
                body=body,
            )
            logger.info(f"[whatsapp] debug-mode: logged alert for violation {violation_data.get('id')} -> {destination}")
            return True

        if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and destination):
            logger.warning(
                "[whatsapp] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / destination number "
                "not all set — skipping send"
            )
            return False

        try:
            from twilio.rest import Client
        except ImportError:
            logger.error(
                "[whatsapp] `twilio` package is not installed. "
                "Run `pip install twilio` or set ALERT_DEBUG_MODE=true for local testing."
            )
            return False

        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(
            from_=f"whatsapp:{settings.TWILIO_WHATSAPP_FROM}",
            body=body,
            to=f"whatsapp:{destination}",
        )
        logger.info(f"[whatsapp] sent alert for violation {violation_data.get('id')} -> {destination}")
        return True
    except Exception:
        logger.exception("[whatsapp] failed to send alert")
        return False
