import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger("tradeo.mail")


def send_password_reset_email(recipient: str, reset_url: str) -> None:
    if settings.mail_backend == "console":
        logger.warning("Development password-reset link for %s: %s", recipient, reset_url)
        return

    message = EmailMessage()
    message["Subject"] = "Reset your Tradeo password"
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = recipient
    message.set_content(
        "We received a request to reset your Tradeo password.\n\n"
        f"Use this one-time link within 30 minutes:\n{reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )
    message.add_alternative(
        "<p>We received a request to reset your Tradeo password.</p>"
        f'<p><a href="{reset_url}">Reset your password</a></p>'
        "<p>This one-time link expires in 30 minutes. If you did not request this, you can ignore this email.</p>",
        subtype="html",
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
