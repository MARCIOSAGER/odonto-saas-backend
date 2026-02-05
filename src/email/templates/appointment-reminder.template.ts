export function appointmentReminderTemplate(
  patientName: string,
  clinicName: string,
  date: string,
  time: string,
  serviceName: string,
  dentistName: string,
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
          <h1 style="color:#ffffff;margin:0;font-size:22px;">Lembrete de Consulta</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333;font-size:16px;line-height:1.6;">Ol&aacute; <strong>${patientName}</strong>,</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">Este &eacute; um lembrete da sua consulta na <strong>${clinicName}</strong>:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background-color:#f0f9ff;border-radius:8px;border:1px solid #e0f2fe;">
            <tr><td style="padding:20px;">
              <table width="100%" cellpadding="4" cellspacing="0">
                <tr>
                  <td style="color:#64748b;font-size:13px;width:100px;">Data:</td>
                  <td style="color:#1e293b;font-size:15px;font-weight:600;">${date}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;">Hor&aacute;rio:</td>
                  <td style="color:#1e293b;font-size:15px;font-weight:600;">${time}</td>
                </tr>
                <tr>
                  <td style="color:#64748b;font-size:13px;">Servi&ccedil;o:</td>
                  <td style="color:#1e293b;font-size:15px;font-weight:600;">${serviceName}</td>
                </tr>
                ${
                  dentistName
                    ? `<tr>
                  <td style="color:#64748b;font-size:13px;">Dentista:</td>
                  <td style="color:#1e293b;font-size:15px;font-weight:600;">${dentistName}</td>
                </tr>`
                    : ''
                }
              </table>
            </td></tr>
          </table>
          <p style="color:#555;font-size:15px;line-height:1.6;">Caso precise remarcar ou cancelar, entre em contato conosco.</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">Aguardamos voc&ecirc;!</p>
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
