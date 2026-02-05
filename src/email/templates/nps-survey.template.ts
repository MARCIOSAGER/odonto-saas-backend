export function npsSurveyTemplate(
  patientName: string,
  clinicName: string,
  surveyUrl: string,
): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#0284c7;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;">Como foi sua experi&ecirc;ncia?</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333;font-size:16px;line-height:1.6;">Ol&aacute; <strong>${patientName}</strong>,</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">Gostar&iacute;amos de saber como foi sua experi&ecirc;ncia na <strong>${clinicName}</strong>.</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">Sua opini&atilde;o &eacute; muito importante para n&oacute;s! Clique no bot&atilde;o abaixo para avaliar:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${surveyUrl}" style="display:inline-block;background-color:#0284c7;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Avaliar agora</a>
          </div>
          <p style="color:#94a3b8;font-size:13px;text-align:center;">Leva menos de 1 minuto</p>
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:20px 30px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">${clinicName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
