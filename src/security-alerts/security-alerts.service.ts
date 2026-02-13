import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EmailService } from '../email/email.service';

type AlertSeverity = 'high' | 'critical';

const FAILED_LOGIN_PREFIX = 'security:failed_login:';
const FAILED_LOGIN_TTL = 15 * 60; // 15 minutes in seconds
const FAILED_LOGIN_WARN_THRESHOLD = 5;
const FAILED_LOGIN_LOCK_THRESHOLD = 10;
const RATE_LIMIT_PREFIX = 'security:rate_limit_alert:';
const RATE_LIMIT_COOLDOWN = 5 * 60; // 5 min cooldown between rate limit alerts

@Injectable()
export class SecurityAlertsService {
  private readonly logger = new Logger(SecurityAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: RedisCacheService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Called after a failed login attempt. Tracks count per IP and triggers alerts.
   */
  async onLoginFailed(
    userId: string,
    clinicId: string | null,
    ip: string | undefined,
    email: string,
  ): Promise<void> {
    try {
      if (!ip) return;

      const key = `${FAILED_LOGIN_PREFIX}${ip}`;
      const current = await this.cacheService.get<number>(key);
      const count = (current || 0) + 1;
      await this.cacheService.set(key, count, FAILED_LOGIN_TTL * 1000);

      if (count >= FAILED_LOGIN_LOCK_THRESHOLD) {
        // Auto-lock the account
        await this.prisma.user.update({
          where: { id: userId },
          data: { status: 'locked' },
        });

        await this.notifyAdmins(
          clinicId,
          'critical',
          'Conta bloqueada automaticamente',
          `A conta ${email} foi bloqueada após ${count} tentativas de login falhadas do IP ${ip}.`,
          { alertType: 'account_locked', userId, ip, attempts: count },
        );
      } else if (count >= FAILED_LOGIN_WARN_THRESHOLD && count === FAILED_LOGIN_WARN_THRESHOLD) {
        await this.notifyAdmins(
          clinicId,
          'high',
          'Múltiplos logins falhados detectados',
          `${count} tentativas de login falhadas para ${email} do IP ${ip} nos últimos 15 minutos.`,
          { alertType: 'multiple_failed_logins', userId, ip, attempts: count },
        );
      }
    } catch (error) {
      this.logger.error(`Failed to process login failure alert: ${error}`);
    }
  }

  /**
   * Called when a user role is changed.
   */
  async onRoleChanged(
    targetUserId: string,
    oldRole: string,
    newRole: string,
    changedByUserId: string,
    clinicId: string | null,
  ): Promise<void> {
    try {
      const [target, changedBy] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: targetUserId },
          select: { name: true, email: true },
        }),
        this.prisma.user.findUnique({
          where: { id: changedByUserId },
          select: { name: true, email: true },
        }),
      ]);

      const severity: AlertSeverity = newRole === 'superadmin' ? 'critical' : 'high';

      await this.notifyAdmins(
        clinicId,
        severity,
        'Alteração de permissão de usuário',
        `${changedBy?.name || changedByUserId} alterou o role de ${target?.name || targetUserId} de "${oldRole}" para "${newRole}".`,
        { alertType: 'role_changed', targetUserId, oldRole, newRole, changedByUserId },
      );
    } catch (error) {
      this.logger.error(`Failed to process role change alert: ${error}`);
    }
  }

  /**
   * Called for suspicious activity (refresh token reuse, unauthorized access, etc.)
   */
  async onSuspiciousActivity(
    type: string,
    details: string,
    userId?: string,
    clinicId?: string | null,
    ip?: string,
  ): Promise<void> {
    try {
      await this.notifyAdmins(
        clinicId || null,
        'critical',
        `Atividade suspeita: ${type}`,
        `${details}${ip ? ` (IP: ${ip})` : ''}`,
        { alertType: type, userId, ip },
      );
    } catch (error) {
      this.logger.error(`Failed to process suspicious activity alert: ${error}`);
    }
  }

  /**
   * Called when rate limiting is triggered excessively.
   */
  async onRateLimitExceeded(ip: string, clinicId?: string): Promise<void> {
    try {
      // Cooldown: don't spam alerts for the same IP
      const cooldownKey = `${RATE_LIMIT_PREFIX}${ip}`;
      const alreadyAlerted = await this.cacheService.get<boolean>(cooldownKey);
      if (alreadyAlerted) return;

      await this.cacheService.set(cooldownKey, true, RATE_LIMIT_COOLDOWN * 1000);

      await this.notifyAdmins(
        clinicId || null,
        'high',
        'Rate limit excedido',
        `O IP ${ip} excedeu o limite de requisições. Possível abuso ou ataque.`,
        { alertType: 'rate_limit_exceeded', ip },
      );
    } catch (error) {
      this.logger.error(`Failed to process rate limit alert: ${error}`);
    }
  }

  /**
   * Notify all admins of a clinic (or superadmins if no clinicId).
   * In-app notification + real-time push. Email for critical severity.
   */
  private async notifyAdmins(
    clinicId: string | null,
    severity: AlertSeverity,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const where: Record<string, unknown> = { status: 'active' };

    if (clinicId) {
      where.clinic_id = clinicId;
      where.role = { in: ['admin', 'superadmin'] };
    } else {
      where.role = 'superadmin';
    }

    const admins = await this.prisma.user.findMany({
      where,
      select: { id: true, email: true, name: true },
    });

    if (admins.length === 0) {
      this.logger.warn(`No admins found to notify (clinicId: ${clinicId})`);
      return;
    }

    const alertData = { ...data, severity, timestamp: new Date().toISOString() };

    // Create in-app notifications + real-time push
    await Promise.all(
      admins.map(async (admin) => {
        const notification = await this.notificationsService.create({
          user_id: admin.id,
          clinic_id: clinicId || undefined,
          type: 'security_alert',
          title: `🔒 ${title}`,
          body,
          data: alertData,
        });

        this.notificationsGateway.sendToUser(admin.id, notification);
      }),
    );

    // Send email for critical alerts
    if (severity === 'critical') {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">⚠️ Alerta Crítico de Segurança</h2>
          </div>
          <div style="background: #fef2f2; padding: 24px; border: 1px solid #fecaca; border-radius: 0 0 8px 8px;">
            <h3 style="color: #991b1b; margin-top: 0;">${title}</h3>
            <p style="color: #7f1d1d;">${body}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
              ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
            </p>
          </div>
        </div>
      `;

      await Promise.all(
        admins.map((admin) =>
          this.emailService.sendMail(admin.email, `[CRÍTICO] ${title}`, html).catch((err) => {
            this.logger.error(`Failed to send security alert email to ${admin.email}: ${err}`);
          }),
        ),
      );
    }

    this.logger.warn(`Security alert [${severity}]: ${title} — ${body}`);
  }
}
