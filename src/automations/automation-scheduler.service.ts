import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { AutomationsService } from './automations.service';
import { CronLockService } from '../common/cron-lock.service';

@Injectable()
export class AutomationSchedulerService {
  private readonly logger = new Logger(AutomationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
    private readonly automationsService: AutomationsService,
    private readonly cronLock: CronLockService,
  ) {}

  /**
   * Follow-up pós-procedimento: roda a cada 30 minutos.
   * Envia mensagem X horas após uma consulta concluída.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleFollowUp(): Promise<void> {
    const acquired = await this.cronLock.tryAcquire('automation_follow_up', 30);
    if (!acquired) return;

    try {
      const automations = await this.automationsService.getActiveByType('follow_up');

      for (const automation of automations) {
        try {
          const config = automation.trigger_config as Record<string, unknown>;
          const actionConfig = automation.action_config as Record<string, unknown>;
          const hoursAfter = (config.hours_after as number) || 2;
          const template =
            (actionConfig.template as string) ||
            'Olá {patientName}! Como você está se sentindo após o procedimento de {service}? Se tiver qualquer dúvida ou desconforto, não hesite em nos contatar. Equipe {clinicName}';

          const now = new Date();
          const targetTimeFrom = new Date(now.getTime() - (hoursAfter + 0.5) * 60 * 60 * 1000);
          const targetTimeTo = new Date(now.getTime() - (hoursAfter - 0.5) * 60 * 60 * 1000);

          // Busca consultas concluídas na janela de tempo que não receberam follow-up
          const appointments = await this.prisma.appointment.findMany({
            where: {
              clinic_id: automation.clinic_id,
              status: 'completed',
              updated_at: {
                gte: targetTimeFrom,
                lte: targetTimeTo,
              },
              // Usa notes como flag para evitar duplicatas
              NOT: {
                notes: { contains: '[FOLLOWUP_SENT]' },
              },
            },
            include: {
              patient: { select: { name: true, phone: true } },
              service: { select: { name: true } },
              dentist: { select: { name: true } },
              clinic: { select: { name: true } },
            },
          });

          let sentCount = 0;
          for (const apt of appointments) {
            if (!apt.patient.phone) continue;

            const message = this.replaceTemplateVars(template, {
              patientName: apt.patient.name,
              service: apt.service.name,
              dentist: apt.dentist?.name || '',
              clinicName: apt.clinic.name,
            });

            const sent = await this.whatsappService.sendMessage(
              apt.clinic_id,
              apt.patient.phone,
              message,
            );

            if (sent) {
              // Marca como enviado adicionando flag nas notas
              const currentNotes = apt.notes || '';
              await this.prisma.appointment.update({
                where: { id: apt.id },
                data: {
                  notes: currentNotes ? `${currentNotes}\n[FOLLOWUP_SENT]` : '[FOLLOWUP_SENT]',
                },
              });
              sentCount++;
            }
          }

          if (sentCount > 0) {
            this.logger.log(
              `Follow-up: ${sentCount} messages sent for clinic ${automation.clinic.name}`,
            );
          }
          await this.automationsService.updateRunStatus(automation.id, true);
        } catch (error) {
          this.logger.error(`Follow-up error for automation ${automation.id}: ${error}`);
          await this.automationsService.updateRunStatus(automation.id, false, String(error));
        }
      }
    } finally {
      await this.cronLock.release('automation_follow_up');
    }
  }

  /**
   * Aniversário: roda diariamente às 9h.
   * Envia mensagem para pacientes que fazem aniversário hoje.
   */
  @Cron('0 9 * * *')
  async handleBirthdays(): Promise<void> {
    const acquired = await this.cronLock.tryAcquire('automation_birthday', 60);
    if (!acquired) return;

    try {
      const automations = await this.automationsService.getActiveByType('birthday');

      for (const automation of automations) {
        try {
          const actionConfig = automation.action_config as Record<string, unknown>;
          const template =
            (actionConfig.template as string) ||
            'Feliz aniversário, {patientName}! 🎂🎉 A equipe {clinicName} deseja um dia maravilhoso! Aproveite para cuidar do seu sorriso com condições especiais neste mês.';

          const today = new Date();
          const month = today.getMonth() + 1;
          const day = today.getDate();

          // Busca pacientes com aniversário hoje
          const patients = await this.prisma.patient.findMany({
            where: {
              clinic_id: automation.clinic_id,
              status: 'active',
              birth_date: { not: null },
            },
            select: {
              id: true,
              name: true,
              phone: true,
              birth_date: true,
            },
          });

          let sentCount = 0;
          for (const patient of patients) {
            if (!patient.birth_date || !patient.phone) continue;

            const birthDate = new Date(patient.birth_date);
            if (birthDate.getMonth() + 1 !== month || birthDate.getDate() !== day) {
              continue;
            }

            const message = this.replaceTemplateVars(template, {
              patientName: patient.name,
              clinicName: automation.clinic.name,
            });

            const sent = await this.whatsappService.sendMessage(
              automation.clinic_id,
              patient.phone,
              message,
            );

            if (sent) sentCount++;
          }

          if (sentCount > 0) {
            this.logger.log(
              `Birthday: ${sentCount} messages sent for clinic ${automation.clinic.name}`,
            );
          }
          await this.automationsService.updateRunStatus(automation.id, true);
        } catch (error) {
          this.logger.error(`Birthday error for automation ${automation.id}: ${error}`);
          await this.automationsService.updateRunStatus(automation.id, false, String(error));
        }
      }
    } finally {
      await this.cronLock.release('automation_birthday');
    }
  }

  /**
   * Reativação: roda semanalmente às segundas 10h.
   * Contata pacientes inativos há X meses.
   */
  @Cron('0 10 * * 1')
  async handleReactivation(): Promise<void> {
    const acquired = await this.cronLock.tryAcquire('automation_reactivation', 60);
    if (!acquired) return;

    try {
      const automations = await this.automationsService.getActiveByType('reactivation');

      for (const automation of automations) {
        try {
          const config = automation.trigger_config as Record<string, unknown>;
          const actionConfig = automation.action_config as Record<string, unknown>;
          const monthsInactive = (config.months_inactive as number) || 3;
          const maxPerRun = (config.max_per_run as number) || 20;
          const template =
            (actionConfig.template as string) ||
            'Olá {patientName}! Sentimos sua falta na {clinicName}. Já faz um tempo desde sua última visita. Que tal agendar uma consulta de acompanhamento? Responda para verificar horários disponíveis!';

          const cutoffDate = new Date();
          cutoffDate.setMonth(cutoffDate.getMonth() - monthsInactive);

          // Busca pacientes que não visitam há X meses
          const patients = await this.prisma.patient.findMany({
            where: {
              clinic_id: automation.clinic_id,
              status: 'active',
              NOT: { phone: '' },
              OR: [
                { last_visit: { lt: cutoffDate } },
                { last_visit: null, created_at: { lt: cutoffDate } },
              ],
            },
            select: {
              id: true,
              name: true,
              phone: true,
              last_visit: true,
            },
            take: maxPerRun,
            orderBy: { last_visit: 'asc' },
          });

          let sentCount = 0;
          for (const patient of patients) {
            if (!patient.phone) continue;

            const message = this.replaceTemplateVars(template, {
              patientName: patient.name,
              clinicName: automation.clinic.name,
            });

            const sent = await this.whatsappService.sendMessage(
              automation.clinic_id,
              patient.phone,
              message,
            );

            if (sent) sentCount++;
          }

          if (sentCount > 0) {
            this.logger.log(
              `Reactivation: ${sentCount} messages sent for clinic ${automation.clinic.name}`,
            );
          }
          await this.automationsService.updateRunStatus(automation.id, true);
        } catch (error) {
          this.logger.error(`Reactivation error for automation ${automation.id}: ${error}`);
          await this.automationsService.updateRunStatus(automation.id, false, String(error));
        }
      }
    } finally {
      await this.cronLock.release('automation_reactivation');
    }
  }

  private replaceTemplateVars(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
}
