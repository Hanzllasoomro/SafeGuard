import smtplib
from email.message import EmailMessage
import os

from config import settings

async def send_email_alert(violation_data, screenshot_path=None):
    if not settings.ENABLE_EMAIL_ALERTS:
        return False


    try:
        msg = EmailMessage()
        msg['Subject'] = '🚨 SafeGuard AI — PPE Violation Detected'
        msg['From'] = settings.ALERT_EMAIL_FROM or settings.SMTP_USER
        msg['To'] = settings.ALERT_EMAIL_TO
        
        missing = violation_data.get('missing_ppe', 'Unknown')
        time_str = violation_data.get('timestamp', 'Unknown')
        content = f"PPE Violation Detected!\nMissing: {missing}\nTime: {time_str}"
        msg.set_content(content)
        
        if screenshot_path and os.path.exists(screenshot_path):
            with open(screenshot_path, 'rb') as f:
                img_data = f.read()
                msg.add_attachment(img_data, maintype='image', subtype='jpeg', filename=os.path.basename(screenshot_path))
                
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
            
        return True
    except Exception as e:
        return False
