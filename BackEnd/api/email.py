from django.conf import settings
from django.core.mail import send_mail


def send_password_reset_email(to_email, reset_token):
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    send_mail(
        subject="Frota Rural - Redefinição de senha",
        message=(
            f"Você solicitou a redefinição de sua senha.\n\n"
            f"Clique no link abaixo para criar uma nova senha:\n"
            f"{reset_url}\n\n"
            f"Este link expira em 1 hora.\n"
            f"Se você não solicitou esta alteração, ignore este e-mail."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
    )
