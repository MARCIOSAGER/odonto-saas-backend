import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ChangePlanDto } from './dto/change-plan.dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  private async notifyClinicUsers(
    clinicId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    const notifications = await this.notificationsService.notifyClinic(
      clinicId,
      type,
      title,
      body,
      data,
    );
    for (const notif of notifications) {
      this.notificationsGateway.sendToUser(notif.user_id, notif);
    }
  }

  /**
   * Get current active subscription for a clinic
   */
  async getCurrent(clinicId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        clinic_id: clinicId,
        status: { in: ['active', 'trialing', 'past_due'] },
      },
      include: {
        plan: true,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    return subscription;
  }

  /**
   * Get subscription usage (current counts vs plan limits)
   */
  async getUsage(clinicId: string) {
    const subscription = await this.getCurrent(clinicId);
    const plan = subscription.plan;

    const [patientCount, dentistCount, appointmentCount] = await Promise.all([
      this.prisma.patient.count({
        where: { clinic_id: clinicId, status: 'active' },
      }),
      this.prisma.dentist.count({
        where: { clinic_id: clinicId, status: 'active' },
      }),
      this.prisma.appointment.count({
        where: {
          clinic_id: clinicId,
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    return {
      subscription_id: subscription.id,
      plan_name: plan.name,
      plan_display_name: plan.display_name,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      trial_end: subscription.trial_end,
      usage: {
        patients: {
          current: patientCount,
          limit: plan.max_patients,
          percentage: plan.max_patients ? Math.round((patientCount / plan.max_patients) * 100) : 0,
        },
        dentists: {
          current: dentistCount,
          limit: plan.max_dentists,
          percentage: plan.max_dentists ? Math.round((dentistCount / plan.max_dentists) * 100) : 0,
        },
        appointments_month: {
          current: appointmentCount,
          limit: plan.max_appointments_month,
          percentage: plan.max_appointments_month
            ? Math.round((appointmentCount / plan.max_appointments_month) * 100)
            : 0,
        },
      },
    };
  }

  /**
   * Create a new subscription (called after successful payment or for trial)
   */
  async create(clinicId: string, dto: CreateSubscriptionDto) {
    // Check no existing active subscription
    const existing = await this.prisma.subscription.findFirst({
      where: {
        clinic_id: clinicId,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Clinic already has an active subscription. Use change-plan instead.',
      );
    }

    // Validate plan exists
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.plan_id },
    });

    if (!plan || plan.status !== 'active') {
      throw new NotFoundException('Plan not found or inactive');
    }

    const billingCycle = dto.billing_cycle || 'monthly';
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Determine if trial (free plan or first subscription)
    const isTrial = Number(plan.price_monthly) === 0 || !dto.payment_gateway;
    const trialEnd = isTrial ? new Date(now) : null;
    if (trialEnd) {
      trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        clinic_id: clinicId,
        plan_id: dto.plan_id,
        billing_cycle: billingCycle,
        status: isTrial ? 'trialing' : 'active',
        current_period_start: now,
        current_period_end: isTrial ? trialEnd! : periodEnd,
        trial_start: isTrial ? now : null,
        trial_end: trialEnd,
        payment_method: dto.payment_method || null,
        payment_gateway: dto.payment_gateway || null,
      },
      include: { plan: true },
    });

    await this.notifyClinicUsers(
      clinicId,
      'subscription_created',
      'Assinatura criada',
      `Plano ${plan.display_name || plan.name} ativado com sucesso`,
      { link: '/settings/billing' },
    );

    return subscription;
  }

  /**
   * Change plan (upgrade/downgrade)
   */
  async changePlan(clinicId: string, dto: ChangePlanDto) {
    const current = await this.getCurrent(clinicId);

    if (current.plan_id === dto.plan_id) {
      throw new BadRequestException('Already on this plan');
    }

    const newPlan = await this.prisma.plan.findUnique({
      where: { id: dto.plan_id },
    });

    if (!newPlan || newPlan.status !== 'active') {
      throw new NotFoundException('Plan not found or inactive');
    }

    const billingCycle = dto.billing_cycle || current.billing_cycle;
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Cancel current subscription
    await this.prisma.subscription.update({
      where: { id: current.id },
      data: {
        status: 'cancelled',
        cancelled_at: now,
      },
    });

    // Create new subscription
    const subscription = await this.prisma.subscription.create({
      data: {
        clinic_id: clinicId,
        plan_id: dto.plan_id,
        billing_cycle: billingCycle,
        status: 'active',
        current_period_start: now,
        current_period_end: periodEnd,
        payment_method: current.payment_method,
        payment_gateway: current.payment_gateway,
        external_id: current.external_id,
      },
      include: { plan: true },
    });

    await this.notifyClinicUsers(
      clinicId,
      'plan_changed',
      'Plano alterado',
      `Plano alterado para ${newPlan.display_name || newPlan.name}`,
      { link: '/settings/billing' },
    );

    return subscription;
  }

  /**
   * Cancel subscription (at period end)
   */
  async cancel(clinicId: string) {
    const subscription = await this.getCurrent(clinicId);

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancel_at_period_end: true,
        cancelled_at: new Date(),
      },
    });

    await this.notifyClinicUsers(
      clinicId,
      'subscription_cancelled',
      'Assinatura cancelada',
      'A assinatura será cancelada ao final do período atual',
      { link: '/settings/billing' },
    );

    return {
      message: 'Subscription will be cancelled at the end of the current period',
      current_period_end: subscription.current_period_end,
    };
  }

  /**
   * Reactivate a subscription that was scheduled for cancellation
   */
  async reactivate(clinicId: string) {
    const subscription = await this.getCurrent(clinicId);

    if (!subscription.cancel_at_period_end) {
      throw new BadRequestException('Subscription is not scheduled for cancellation');
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancel_at_period_end: false,
        cancelled_at: null,
      },
    });

    await this.notifyClinicUsers(
      clinicId,
      'subscription_reactivated',
      'Assinatura reativada',
      'A assinatura foi reativada com sucesso',
      { link: '/settings/billing' },
    );

    return { message: 'Subscription reactivated successfully' };
  }

  /**
   * Get all invoices for a clinic's subscription
   */
  async getInvoices(clinicId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { clinic_id: clinicId },
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: { payments: true },
      }),
      this.prisma.invoice.count({ where: { clinic_id: clinicId } }),
    ]);

    return {
      data: invoices,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Activate subscription after payment confirmation (called from webhook)
   */
  async activateFromPayment(
    clinicId: string,
    subscriptionId: string,
    gatewaySubscriptionId?: string,
  ) {
    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'active',
        external_id: gatewaySubscriptionId || undefined,
      },
    });
  }

  /**
   * Mark subscription as past_due (called from webhook on failed payment)
   */
  async markPastDue(subscriptionId: string) {
    return this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'past_due' },
    });
  }

  /**
   * Expire trial subscriptions (called from cron job)
   */
  async expireTrials() {
    const now = new Date();
    const expired = await this.prisma.subscription.updateMany({
      where: {
        status: 'trialing',
        trial_end: { lte: now },
      },
      data: { status: 'expired' },
    });

    return { expired: expired.count };
  }
}
