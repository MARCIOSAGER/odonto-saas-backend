import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeGateway } from './gateways/stripe.gateway';
import { AsaasGateway } from './gateways/asaas.gateway';
import { CouponService } from './coupon.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NfseService } from './nfse/nfse.service';
import { CheckoutDto } from './dto/checkout.dto';
import { PaymentGateway, WebhookEvent } from './gateways/payment-gateway.interface';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeGateway: StripeGateway,
    private readonly asaasGateway: AsaasGateway,
    private readonly couponService: CouponService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly nfseService: NfseService,
  ) {}

  private getGateway(name: string): PaymentGateway {
    switch (name) {
      case 'stripe':
        return this.stripeGateway;
      case 'asaas':
        return this.asaasGateway;
      default:
        throw new BadRequestException(`Unknown payment gateway: ${name}`);
    }
  }

  /**
   * Create checkout session for a plan
   */
  async checkout(clinicId: string, dto: CheckoutDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.plan_id },
    });

    if (!plan || plan.status !== 'active') {
      throw new NotFoundException('Plan not found or inactive');
    }

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }

    const billingCycle = dto.billing_cycle || 'monthly';
    let amount =
      billingCycle === 'yearly' && plan.price_yearly
        ? Number(plan.price_yearly) * 100
        : Number(plan.price_monthly) * 100;

    // Validate and apply coupon
    let couponDiscount = 0;
    if (dto.coupon_code) {
      const coupon = await this.couponService.validate(dto.coupon_code);
      couponDiscount = coupon.discount_percent;
      amount = Math.round(amount * (1 - couponDiscount / 100));
    }

    if (amount === 0) {
      // Free plan — create subscription directly
      const subscription = await this.subscriptionsService.create(clinicId, {
        plan_id: dto.plan_id,
        billing_cycle: billingCycle,
      });
      return { subscription, checkout_url: null };
    }

    const gatewayName = dto.gateway || 'stripe';
    const gateway = this.getGateway(gatewayName);

    // Create subscription in our DB first
    const subscription = await this.subscriptionsService.create(clinicId, {
      plan_id: dto.plan_id,
      billing_cycle: billingCycle,
      payment_method: dto.payment_method,
      payment_gateway: gatewayName,
    });

    // Create checkout on the gateway
    const result = await gateway.createCheckout({
      clinic_id: clinicId,
      plan_id: dto.plan_id,
      plan_name: plan.display_name || plan.name,
      amount,
      billing_cycle: billingCycle as 'monthly' | 'yearly',
      customer_email: clinic.email,
      customer_name: clinic.name,
      customer_document: clinic.cnpj,
      payment_method: dto.payment_method as any,
      coupon_discount_percent: couponDiscount || undefined,
      metadata: {
        subscription_id: subscription.id,
        clinic_id: clinicId,
      },
    });

    // Apply coupon if checkout succeeded
    if (dto.coupon_code) {
      await this.couponService.apply(dto.coupon_code);
    }

    return {
      subscription_id: subscription.id,
      ...result,
    };
  }

  /**
   * Process a webhook event from a payment gateway
   */
  async processWebhook(event: WebhookEvent) {
    this.logger.log(
      `Processing ${event.gateway} webhook: ${event.type} (${event.gateway_event_id})`,
    );

    switch (event.type) {
      case 'checkout.completed':
      case 'payment.succeeded':
        await this.handlePaymentSuccess(event);
        break;

      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;

      case 'subscription.cancelled':
        await this.handleSubscriptionCancelled(event);
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handlePaymentSuccess(event: WebhookEvent) {
    const metadata = event.metadata || {};
    const subscriptionId =
      (metadata.subscription_id as string) ||
      (metadata.externalReference as string);

    if (!subscriptionId) {
      this.logger.warn('Payment success webhook without subscription_id');
      return;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        OR: [
          { id: subscriptionId },
          { external_id: event.gateway_subscription_id || '' },
        ],
      },
      include: { clinic: true, plan: true },
    });

    if (!subscription) {
      this.logger.warn(
        `Subscription not found for webhook: ${subscriptionId}`,
      );
      return;
    }

    // Activate subscription
    await this.subscriptionsService.activateFromPayment(
      subscription.clinic_id,
      subscription.id,
      event.gateway_subscription_id,
    );

    // Create invoice record
    const invoiceNumber = `INV-${Date.now()}`;
    const amount = event.amount ? event.amount / 100 : Number(subscription.plan.price_monthly);

    const invoice = await this.prisma.invoice.create({
      data: {
        clinic_id: subscription.clinic_id,
        subscription_id: subscription.id,
        number: invoiceNumber,
        amount,
        total: amount,
        status: 'paid',
        due_date: new Date(),
        paid_at: new Date(),
        payment_method: subscription.payment_method,
        payment_gateway: event.gateway,
        external_id: event.gateway_payment_id,
        description: `Plano ${subscription.plan.display_name || subscription.plan.name}`,
      },
    });

    // Create payment record
    await this.prisma.payment.create({
      data: {
        invoice_id: invoice.id,
        gateway: event.gateway,
        gateway_payment_id: event.gateway_payment_id,
        method: subscription.payment_method || 'credit_card',
        amount,
        status: 'confirmed',
        paid_at: new Date(),
      },
    });

    // Emit NFS-e if clinic has premium plan with auto NFS-e
    const features = (subscription.plan.features as any) || {};
    if (features.has_nfse_auto && subscription.clinic) {
      await this.nfseService.emit({
        invoice_id: invoice.id,
        clinic_id: subscription.clinic_id,
        clinic_name: subscription.clinic.name,
        clinic_cnpj: subscription.clinic.cnpj,
        amount,
        description: `Plano ${subscription.plan.display_name || subscription.plan.name} — Odonto SaaS`,
      });
    }

    this.logger.log(
      `Payment confirmed for clinic ${subscription.clinic_id}, invoice ${invoice.number}`,
    );
  }

  private async handlePaymentFailed(event: WebhookEvent) {
    if (event.gateway_subscription_id) {
      const subscription = await this.prisma.subscription.findFirst({
        where: { external_id: event.gateway_subscription_id },
      });

      if (subscription) {
        await this.subscriptionsService.markPastDue(subscription.id);
        this.logger.log(
          `Marked subscription ${subscription.id} as past_due`,
        );
      }
    }
  }

  private async handleSubscriptionCancelled(event: WebhookEvent) {
    if (event.gateway_subscription_id) {
      const subscription = await this.prisma.subscription.findFirst({
        where: { external_id: event.gateway_subscription_id },
      });

      if (subscription) {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'cancelled',
            cancelled_at: new Date(),
          },
        });
        this.logger.log(`Subscription ${subscription.id} cancelled via webhook`);
      }
    }
  }

  /**
   * Get invoices for admin (all clinics)
   */
  async getAdminInvoices(
    page = 1,
    limit = 20,
    filters?: { status?: string; clinic_id?: string },
  ) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);
    const where: Record<string, unknown> = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.clinic_id) where.clinic_id = filters.clinic_id;

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: {
          clinic: { select: { id: true, name: true, cnpj: true } },
          subscription: { include: { plan: true } },
          payments: true,
        },
      }),
      this.prisma.invoice.count({ where }),
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
   * Admin billing overview (MRR, active subs, etc.)
   */
  async getAdminOverview() {
    const [
      activeSubscriptions,
      trialingSubscriptions,
      pastDueSubscriptions,
      totalRevenue,
      monthlyRevenue,
    ] = await Promise.all([
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.subscription.count({ where: { status: 'trialing' } }),
      this.prisma.subscription.count({ where: { status: 'past_due' } }),
      this.prisma.invoice.aggregate({
        where: { status: 'paid' },
        _sum: { total: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: 'paid',
          paid_at: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { total: true },
      }),
    ]);

    // MRR calculation: sum of monthly-equivalent amounts for active subs
    const activeSubs = await this.prisma.subscription.findMany({
      where: { status: 'active' },
      include: { plan: true },
    });

    const mrr = activeSubs.reduce((sum, sub) => {
      const monthlyPrice =
        sub.billing_cycle === 'yearly' && sub.plan.price_yearly
          ? Number(sub.plan.price_yearly) / 12
          : Number(sub.plan.price_monthly);
      return sum + monthlyPrice;
    }, 0);

    return {
      mrr: Math.round(mrr * 100) / 100,
      active_subscriptions: activeSubscriptions,
      trialing_subscriptions: trialingSubscriptions,
      past_due_subscriptions: pastDueSubscriptions,
      total_revenue: Number(totalRevenue._sum.total) || 0,
      monthly_revenue: Number(monthlyRevenue._sum.total) || 0,
    };
  }
}
