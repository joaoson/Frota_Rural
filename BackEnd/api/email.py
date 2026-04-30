import resend
from django.conf import settings

def send_password_reset_email(to_email: str, reset_token: str) -> None:
    resend.api_key = settings.RESEND_API_KEY
    from_email = settings.RESEND_SUPPORT_EMAIL
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    timeout_minutes = settings.PASSWORD_RESET_TIMEOUT / 60

    params: resend.Emails.SendParams = {
        "from": from_email,
        "to": [to_email],
        "subject": "Redefinição de senha",
        "html": _build_reset_email_html(reset_url, round(timeout_minutes)),
    }

    resend.Emails.send(params)

## Timeout tem que ser em minutos
def _build_reset_email_html(reset_url: str, timeout: int) -> str:
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinição de Senha</title>
</head>
<body style="margin:0;padding:0;background-color:#fffaeb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fffaeb;">
    <tr>
      <td align="center" style="padding:48px 20px;">

        <!-- ── Card ── -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:520px;background-color:#ffffff;border-radius:20px;border:1px solid #c3c8b5;box-shadow:0 8px 32px rgba(20,61,14,0.10);">

          <!-- Header -->
          <tr>
            <td align="center" style="padding:44px 40px 20px;">
              <h1 style="margin:0 0 14px;font-size:28px;font-weight:800;color:#143d0e;letter-spacing:-0.4px;line-height:1.2;">
                Redefinição de Senha
              </h1>

              <!-- Accent bar -->
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
                <tr>
                  <td style="width:64px;height:3px;background-color:#feb734;border-radius:2px;"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 40px 36px;">

              <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#3f4336;">
                Recebemos uma solicitação para redefinir a senha da sua conta na
                <strong style="color:#143d0e;">Frota Rural</strong>.
                Clique no botão abaixo para criar uma nova senha.
              </p>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding-bottom:32px;">
                    <a href="{reset_url}"
                       style="display:inline-block;padding:15px 40px;background-color:#143d0e;background-image:linear-gradient(135deg,#143d0e 0%,#1e5c18 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback -->
              <p style="margin:0 0 6px;font-size:11px;color:#6b7165;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">
                Se o botão não funcionar, copie e cole este link:
              </p>
              <p style="margin:0 0 24px;font-size:12px;word-break:break-all;line-height:1.5;">
                <a href="{reset_url}" style="color:#143d0e;text-decoration:underline;">{reset_url}</a>
              </p>

              <!-- Expiry notice -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background-color:#fff8e8;border:1px solid #fed566;border-radius:8px;padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#7a5c00;line-height:1.5;">
                      &#9200; Este link expira em <strong>{timeout} minutos</strong> e só pode ser usado uma vez.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f5f0e8;border-top:1px solid #e8e3d8;border-radius:0 0 20px 20px;padding:20px 40px;">
              <p style="margin:0 0 6px;font-size:12px;color:#6b7165;line-height:1.6;">
                Se você não solicitou esta alteração, ignore este e-mail com segurança.
                Sua senha permanecerá a mesma.
              </p>
              <p style="margin:0;font-size:11px;color:#9aa090;">
                &copy; 2026 Frota Rural
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>"""

