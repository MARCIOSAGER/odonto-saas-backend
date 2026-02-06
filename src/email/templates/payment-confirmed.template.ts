export function paymentConfirmedTemplate(name: string, planName: string, amount: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#10B981;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;">Pagamento confirmado!</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333;font-size:16px;line-height:1.6;">Ol&aacute; <strong>${name}</strong>,</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">Seu pagamento foi processado com sucesso.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr>
              <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#555;font-size:14px;">Plano</td>
              <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#333;font-size:14px;font-weight:600;text-align:right;">${planName}</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#555;font-size:14px;">Valor</td>
              <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#333;font-size:14px;font-weight:600;text-align:right;">R$ ${amount}</td>
            </tr>
          </table>
          <p style="color:#555;font-size:15px;line-height:1.6;">Obrigado por confiar na INTER-IA!</p>
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:20px 30px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">INTER-IA - Gest&atilde;o inteligente para cl&iacute;nicas odontol&oacute;gicas</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
