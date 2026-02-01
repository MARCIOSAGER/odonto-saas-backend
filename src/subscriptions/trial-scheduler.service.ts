import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TrialSchedulerService {
  private readonly logger = new Logger(TrialSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Daily check: expire trials that have ended
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireTrials() {
    try {
      const now = new Date();

      const expiredTrials = await this.prisma.subscription.findMany({
        where: {
          status: 'trialing',
          trial_end: { lte: now },
        },
        include: {
          clinic: {
            select: { id: true, name: true },
            include: { users: { where: { role: 'owner' }, select: { id: true, name: true, email: true } } },
          },
        },
      });

      for (const sub of expiredTrials) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'expired' },
        });

        // Notify clinic owners
        for (const user of (sub.clinic as any).users) {
          await this.email.sendMailForClinic(
            sub.clinic_id,
            user.email,
            'Seu período de teste expirou',
            this.trialExpiredTemplate(user.name, sub.clinic.name),
          );

          try {
            await this.notifications.create({
              user_id: user.id,
              clinic_id: sub.clinic_id,
              type: 'trial_expired',
              title: 'Trial expirado',
              body: 'Seu período de teste terminou. Assine um plano para continuar usando todos os recursos.',
              data: { link: '/settings/billing' },
            });
          } catch {
            // notification service might not support this signature
          }
        }

        this.logger.log(`Trial expired for clinic ${sub.clinic.name} (${sub.clinic_id})`);
      }

      if (expiredTrials.length > 0) {
        this.logger.log(`Expired ${expiredTrials.length} trial subscriptions`);
      }
    } catch (error) {
      this.logger.error(`Trial expiration cron error: ${error}`);
    }
  }

  /**
   * Daily check: send reminders for trials expiring soon (7d, 3d, 1d)
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendTrialReminders() {
    try {
      const now = new Date();

      for (const daysLeft of [7, 3, 1]) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysLeft);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const expiring = await this.prisma.subscription.findMany({
          where: {
            status: 'trialing',
            trial_end: {
              gte: targetDate,
              lt: nextDay,
            },
          },
          include: {
            clinic: {
              select: { id: true, name: true },
              include: { users: { where: { role: 'owner' }, select: { id: true, name: true, email: true } } },
            },
          },
        });

        for (const sub of expiring) {
          for (const user of (sub.clinic as any).users) {
            await this.email.sendMailForClinic(
              sub.clinic_id,
              user.email,
              `Seu trial expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`,
              this.trialExpiringTemplate(user.name, sub.clinic.name, daysLeft),
            );

            try {
              await this.notifications.create({
                user_id: user.id,
                clinic_id: sub.clinic_id,
                type: 'trial_expiring',
                title: `Trial expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`,
                body: `Assine um plano para continuar usando todos os recursos do Odonto SaaS.`,
                data: { link: '/settings/billing', days_left: daysLeft },
              });
            } catch {
              // ignore
            }
          }
        }

        if (expiring.length > 0) {
          this.logger.log(`Sent ${daysLeft}-day trial reminders to ${expiring.length} clinics`);
        }
      }
    } catch (error) {
      this.logger.error(`Trial reminder cron error: ${error}`);
    }
  }

  /**
   * Daily check: cancel subscriptions scheduled for cancellation at period end
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async processCancellations() {
    try {
      const now = new Date();

      const result = await this.prisma.subscription.updateMany({
        where: {
          cancel_at_period_end: true,
          current_period_end: { lte: now },
          status: { in: ['active', 'past_due'] },
        },
        data: { status: 'cancelled' },
      });

      if (result.count > 0) {
        this.logger.log(`Cancelled ${result.count} subscriptions at period end`);
      }
    } catch (error) {
      this.logger.error(`Cancellation cron error: ${error}`);
    }
  }

  // ── Email Templates ──

  private trialExpiringTemplate(name: string, clinicName: string, daysLeft: number): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#f59e0b;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;">Seu trial expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333;font-size:16px;line-height:1.6;">Ol&aacute; <strong>${name}</strong>,</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">O per&iacute;odo de teste da cl&iacute;nica <strong>${clinicName}</strong> no Odonto SaaS termina em <strong>${daysLeft} dia${daysLeft > 1 ? 's' : ''}</strong>.</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">Para continuar usando todos os recursos sem interrup&ccedil;&atilde;o, assine um de nossos planos:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing" style="display:inline-block;background-color:#0284c7;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Escolher plano</a>
          </div>
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:20px 30px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">Odonto SaaS - Gest&atilde;o inteligente para cl&iacute;nicas odontol&oacute;gicas</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private trialExpiredTemplate(name: string, clinicName: string): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background-color:#ef4444;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;">Seu per&iacute;odo de teste expirou</h1>
        </td></tr>
        <tr><td style="padding:40px 30px;">
          <p style="color:#333;font-size:16px;line-height:1.6;">Ol&aacute; <strong>${name}</strong>,</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">O per&iacute;odo de teste da cl&iacute;nica <strong>${clinicName}</strong> no Odonto SaaS terminou.</p>
          <p style="color:#555;font-size:15px;line-height:1.6;">Seus dados est&atilde;o seguros, mas o acesso ficou limitado ao modo somente leitura. Para voltar a usar todos os recursos, assine um plano:</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing" style="display:inline-block;background-color:#0284c7;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Assinar agora</a>
          </div>
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:20px 30px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">Odonto SaaS - Gest&atilde;o inteligente para cl&iacute;nicas odontol&oacute;gicas</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }
}
