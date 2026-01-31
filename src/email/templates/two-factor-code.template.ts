export function twoFactorCodeTemplate(name: string, code: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Verificação</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#6366F1;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Código de Verificação</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;text-align:center;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Olá <strong>${name}</strong>,
              </p>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 30px;">
                Seu código de verificação é:
              </p>
              <div style="background-color:#f1f5f9;border-radius:12px;padding:20px;display:inline-block;">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1e293b;">${code}</span>
              </div>
              <p style="color:#888;font-size:13px;line-height:1.6;margin:30px 0 0;">
                Este código é válido por <strong>5 minutos</strong>. Não compartilhe com ninguém.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 30px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:12px;margin:0;">
                Se você não solicitou este código, altere sua senha imediatamente.
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
