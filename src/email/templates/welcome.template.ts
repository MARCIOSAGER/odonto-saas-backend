export function welcomeTemplate(name: string, clinicName: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#10B981;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;">Bem-vindo ao INTER-IA!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 30px;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Olá <strong>${name}</strong>,
              </p>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Sua conta para a clínica <strong>${clinicName}</strong> foi criada com sucesso! 🎉
              </p>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Agora você pode começar a gerenciar sua clínica com todas as funcionalidades da plataforma:
              </p>
              <ul style="color:#555;font-size:15px;line-height:2;padding-left:20px;">
                <li>Gerenciamento de pacientes</li>
                <li>Agendamento inteligente</li>
                <li>Assistente virtual com IA</li>
                <li>Integração com WhatsApp</li>
                <li>Relatórios e métricas</li>
              </ul>
              <p style="color:#555;font-size:15px;line-height:1.6;margin:20px 0 0;">
                Se precisar de ajuda, não hesite em entrar em contato com nosso suporte.
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
