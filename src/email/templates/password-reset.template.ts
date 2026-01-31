export function passwordResetTemplate(name: string, resetLink: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefinir Senha</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0EA5E9;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Redefinir Senha</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Olá <strong>${name}</strong>,
              </p>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 30px;">
                Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display:inline-block;background-color:#0EA5E9;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:600;">
                      Redefinir Senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#888;font-size:13px;line-height:1.6;margin:30px 0 0;">
                Este link é válido por <strong>1 hora</strong>. Se você não solicitou esta redefinição, ignore este email.
              </p>
              <p style="color:#888;font-size:13px;line-height:1.6;margin:15px 0 0;">
                Se o botão não funcionar, copie e cole este link no navegador:<br>
                <a href="${resetLink}" style="color:#0EA5E9;word-break:break-all;">${resetLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 30px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:12px;margin:0;">
                Este é um email automático, por favor não responda.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
