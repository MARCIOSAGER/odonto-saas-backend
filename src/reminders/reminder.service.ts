import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Roda a cada 5 minutos, verifica consultas próximas e envia lembretes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleReminders(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Reminder job already running, skipping');
      return;
    }

    this.isRunning = true;
    try {
      await this.send24hReminders();
      await this.send1hReminders();
    } catch (error) {
      this.logger.error(`Reminder job failed: ${error}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Envia lembretes 24h antes da consulta.
   * Busca consultas com status 'scheduled' entre 23h e 25h a partir de agora.
   */
  private async send24hReminders(): Promise<void> {
    const now = new Date();
    const from23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const to25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    // Busca consultas agendadas nas próximas ~24h que não receberam lembrete
    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: 'scheduled',
        reminder_sent: false,
        date: {
          gte: new Date(from23h.toISOString().split('T')[0]),
          lte: new Date(to25h.toISOString().split('T')[0] + 'T23:59:59Z'),
        },
      },
      include: {
        patient: { select: { name: true, phone: true, email: true } },
        dentist: { select: { name: true } },
        service: { select: { name: true } },
        clinic: {
          select: {
            name: true,
            aiSettings: {
              select: {
                reminder_enabled: true,
                reminder_24h: true,
                reminder_message_24h: true,
              },
            },
          },
        },
      },
    });

    for (const apt of appointments) {
      // Verifica se a clínica tem lembretes habilitados
      const settings = apt.clinic.aiSettings;
      if (!settings?.reminder_enabled || !settings?.reminder_24h) continue;

      // Verifica se o horário está na janela de 24h
      const aptDateTime = this.getAppointmentDateTime(apt.date, apt.time);
      const diffMs = aptDateTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 23 || diffHours > 25) continue;

      // Pula se paciente não tem phone nem email
      if (!apt.patient.phone && !apt.patient.email) continue;

      const dateStr = this.formatDate(apt.date);
      const message = settings.reminder_message_24h
        ? this.replaceTemplateVars(settings.reminder_message_24h, {
            patientName: apt.patient.name,
            date: dateStr,
            time: apt.time,
            service: apt.service.name,
            dentist: apt.dentist?.name || '',
            clinicName: apt.clinic.name,
          })
        : `Ola ${apt.patient.name}! Lembramos que voce tem uma consulta amanha (${dateStr}) as ${apt.time} na ${apt.clinic.name}.\n\nServico: ${apt.service.name}${apt.dentist ? `\nDentista: ${apt.dentist.name}` : ''}\n\nPor favor, confirme sua presenca respondendo SIM ou NAO.`;

      let sent = false;

      // Tenta WhatsApp primeiro
      if (apt.patient.phone) {
        sent = await this.whatsappService.sendMessage(
          apt.clinic_id,
          apt.patient.phone,
          message,
        );
      }

      // Fallback: email se WhatsApp falhou ou paciente não tem phone
      if (!sent && apt.patient.email) {
        sent = await this.emailService.sendAppointmentReminder(
          apt.clinic_id,
          apt.patient.email,
          apt.patient.name,
          apt.clinic.name,
          dateStr,
          apt.time,
          apt.service.name,
          apt.dentist?.name || '',
        );
        if (sent) {
          this.logger.log(
            `24h reminder sent via EMAIL for appointment ${apt.id} - Patient: ${apt.patient.name}`,
          );
        }
      }

      if (sent) {
        await this.prisma.appointment.update({
          where: { id: apt.id },
          data: { reminder_sent: true },
        });
        if (apt.patient.phone) {
          this.logger.log(
            `24h reminder sent for appointment ${apt.id} - Patient: ${apt.patient.name}`,
          );
        }
      }
    }
  }

  /**
   * Envia lembretes 1h antes da consulta.
   * Busca consultas entre 50min e 70min a partir de agora.
   */
  private async send1hReminders(): Promise<void> {
    const now = new Date();

    const today = new Date(now.toISOString().split('T')[0]);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    // Busca consultas de hoje/amanhã que não receberam lembrete de 1h
    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: { in: ['scheduled', 'confirmed'] },
        reminder_1h_sent: false,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        patient: { select: { name: true, phone: true, email: true } },
        dentist: { select: { name: true } },
        service: { select: { name: true } },
        clinic: {
          select: {
            name: true,
            aiSettings: {
              select: {
                reminder_enabled: true,
                reminder_1h: true,
                reminder_message_1h: true,
              },
            },
          },
        },
      },
    });

    for (const apt of appointments) {
      const settings = apt.clinic.aiSettings;
      if (!settings?.reminder_enabled || !settings?.reminder_1h) continue;

      // Verifica se está na janela de ~1h
      const aptDateTime = this.getAppointmentDateTime(apt.date, apt.time);
      const diffMs = aptDateTime.getTime() - now.getTime();
      const diffMin = diffMs / (1000 * 60);

      if (diffMin < 50 || diffMin > 70) continue;

      if (!apt.patient.phone && !apt.patient.email) continue;

      const dateStr = this.formatDate(apt.date);
      const message = settings.reminder_message_1h
        ? this.replaceTemplateVars(settings.reminder_message_1h, {
            patientName: apt.patient.name,
            date: dateStr,
            time: apt.time,
            service: apt.service.name,
            dentist: apt.dentist?.name || '',
            clinicName: apt.clinic.name,
          })
        : `Ola ${apt.patient.name}! Sua consulta e daqui a 1 hora (${apt.time}) na ${apt.clinic.name}.\n\nEstamos te aguardando!`;

      let sent = false;

      if (apt.patient.phone) {
        sent = await this.whatsappService.sendMessage(
          apt.clinic_id,
          apt.patient.phone,
          message,
        );
      }

      // Fallback: email se WhatsApp falhou ou paciente não tem phone
      if (!sent && apt.patient.email) {
        sent = await this.emailService.sendAppointmentReminder(
          apt.clinic_id,
          apt.patient.email,
          apt.patient.name,
          apt.clinic.name,
          dateStr,
          apt.time,
          apt.service.name,
          apt.dentist?.name || '',
        );
        if (sent) {
          this.logger.log(
            `1h reminder sent via EMAIL for appointment ${apt.id} - Patient: ${apt.patient.name}`,
          );
        }
      }

      if (sent) {
        await this.prisma.appointment.update({
          where: { id: apt.id },
          data: { reminder_1h_sent: true },
        });
        if (apt.patient.phone) {
          this.logger.log(
            `1h reminder sent for appointment ${apt.id} - Patient: ${apt.patient.name}`,
          );
        }
      }
    }
  }

  /**
   * Combina date (Date) + time (string "HH:MM") em um Date completo.
   */
  private getAppointmentDateTime(date: Date, time: string): Date {
    const dateStr = date.toISOString().split('T')[0];
    const [hours, minutes] = time.split(':').map(Number);
    const dt = new Date(dateStr + 'T00:00:00');
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }

  /**
   * Formata data para DD/MM/YYYY.
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  /**
   * Substitui variáveis de template: {patientName}, {date}, {time}, etc.
   */
  private replaceTemplateVars(
    template: string,
    vars: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
}
