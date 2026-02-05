import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  PaymentGateway,
  CreateCheckoutParams,
  CheckoutResult,
  CreateSubscriptionParams,
  GatewaySubscriptionResult,
  WebhookEvent,
} from './payment-gateway.interface';

@Injectable()
export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe';
  private stripe: Stripe | null = null;
  private readonly logger = new Logger(StripeGateway.name);

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      this.logger.warn('STRIPE_SECRET_KEY not configured — Stripe gateway disabled');
    }
  }

  private ensureConfigured(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY env var.');
    }
    return this.stripe;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const stripe = this.ensureConfigured();

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: params.customer_email,
      line_items: [
        {
          price_data: {
            currency: params.currency || 'brl',
            product_data: {
              name: `Odonto SaaS — ${params.plan_name}`,
            },
            unit_amount: params.amount,
            recurring: {
              interval: params.billing_cycle === 'yearly' ? 'year' : 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: params.success_url || `${frontendUrl}/settings/billing?success=true`,
      cancel_url: params.cancel_url || `${frontendUrl}/settings/billing?cancelled=true`,
      metadata: {
        clinic_id: params.clinic_id,
        plan_id: params.plan_id,
        ...params.metadata,
      },
    });

    return {
      checkout_url: session.url || undefined,
      payment_id: session.id,
      status: 'pending',
    };
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<GatewaySubscriptionResult> {
    const stripe = this.ensureConfigured();

    // Find or create customer
    const customers = await stripe.customers.list({
      email: params.customer_email,
      limit: 1,
    });

    let customer: Stripe.Customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: params.customer_email,
        name: params.customer_name,
        metadata: { clinic_id: params.clinic_id },
      });
    }

    // Create a price
    const price = await stripe.prices.create({
      currency: params.currency || 'brl',
      unit_amount: params.amount,
      recurring: {
        interval: params.billing_cycle === 'yearly' ? 'year' : 'month',
      },
      product_data: {
        name: `Odonto SaaS — ${params.plan_name}`,
      },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      metadata: {
        clinic_id: params.clinic_id,
        ...params.metadata,
      },
    });

    const sub = subscription as any;
    return {
      gateway_subscription_id: subscription.id,
      status: subscription.status,
      current_period_start: new Date(
        (sub.current_period_start || Math.floor(Date.now() / 1000)) * 1000,
      ),
      current_period_end: new Date(
        (sub.current_period_end || Math.floor(Date.now() / 1000) + 30 * 86400) * 1000,
      ),
    };
  }

  async cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    const stripe = this.ensureConfigured();
    await stripe.subscriptions.cancel(gatewaySubscriptionId);
  }

  async parseWebhook(
    body: Buffer | string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const stripe = this.ensureConfigured();
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    const sig = headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(body as Buffer, sig, webhookSecret);

    const eventMap: Record<string, string> = {
      'checkout.session.completed': 'checkout.completed',
      'invoice.paid': 'payment.succeeded',
      'invoice.payment_failed': 'payment.failed',
      'customer.subscription.updated': 'subscription.updated',
      'customer.subscription.deleted': 'subscription.cancelled',
    };

    const type = eventMap[event.type] || event.type;
    const data = event.data.object as unknown as Record<string, unknown>;

    return {
      type,
      gateway: 'stripe',
      gateway_event_id: event.id,
      gateway_subscription_id: (data.subscription as string) || undefined,
      gateway_payment_id: (data.payment_intent as string) || undefined,
      amount: (data.amount_paid as number) || (data.amount_total as number),
      status: (data.status as string) || undefined,
      metadata: (data.metadata as Record<string, unknown>) || {},
      raw: event,
    };
  }
}
