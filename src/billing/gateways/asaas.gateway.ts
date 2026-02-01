import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  PaymentGateway,
  CreateCheckoutParams,
  CheckoutResult,
  CreateSubscriptionParams,
  GatewaySubscriptionResult,
  WebhookEvent,
} from './payment-gateway.interface';

@Injectable()
export class AsaasGateway implements PaymentGateway {
  readonly name = 'asaas';
  private client: AxiosInstance | null = null;
  private readonly logger = new Logger(AsaasGateway.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ASAAS_API_KEY');
    const sandbox = this.configService.get<string>('ASAAS_SANDBOX') === 'true';
    const baseURL = sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';

    if (apiKey) {
      this.client = axios.create({
        baseURL,
        headers: {
          'Content-Type': 'application/json',
          access_token: apiKey,
        },
      });
    } else {
      this.logger.warn('ASAAS_API_KEY not configured — ASAAS gateway disabled');
    }
  }

  private ensureConfigured(): AxiosInstance {
    if (!this.client) {
      throw new Error('ASAAS is not configured. Set ASAAS_API_KEY env var.');
    }
    return this.client;
  }

  /**
   * Find or create customer in ASAAS
   */
  private async findOrCreateCustomer(
    name: string,
    email: string,
    document?: string,
  ): Promise<string> {
    const client = this.ensureConfigured();

    // Search by CPF/CNPJ first
    if (document) {
      const { data: search } = await client.get('/customers', {
        params: { cpfCnpj: document },
      });
      if (search.data?.length > 0) {
        return search.data[0].id;
      }
    }

    // Create customer
    const { data: customer } = await client.post('/customers', {
      name,
      email,
      cpfCnpj: document,
    });

    return customer.id;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const client = this.ensureConfigured();

    const customerId = await this.findOrCreateCustomer(
      params.customer_name,
      params.customer_email,
      params.customer_document,
    );

    const billingType = this.mapPaymentMethod(params.payment_method);
    const value = params.amount / 100; // ASAAS uses decimal, not cents

    // Apply coupon discount
    let finalValue = value;
    if (params.coupon_discount_percent) {
      finalValue = value * (1 - params.coupon_discount_percent / 100);
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const { data: payment } = await client.post('/payments', {
      customer: customerId,
      billingType,
      value: finalValue,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `Odonto SaaS — ${params.plan_name}`,
      externalReference: params.clinic_id,
    });

    const result: CheckoutResult = {
      payment_id: payment.id,
      status: 'pending',
    };

    if (billingType === 'PIX' && payment.id) {
      try {
        const { data: pix } = await client.get(
          `/payments/${payment.id}/pixQrCode`,
        );
        result.pix_qr_code = pix.encodedImage;
        result.pix_copy_paste = pix.payload;
      } catch (e) {
        this.logger.warn('Failed to get PIX QR code:', e);
      }
    }

    if (billingType === 'BOLETO') {
      result.boleto_url = payment.bankSlipUrl;
    }

    if (payment.invoiceUrl) {
      result.checkout_url = payment.invoiceUrl;
    }

    return result;
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<GatewaySubscriptionResult> {
    const client = this.ensureConfigured();

    const customerId = await this.findOrCreateCustomer(
      params.customer_name,
      params.customer_email,
      params.customer_document,
    );

    const value = params.amount / 100;
    const cycle = params.billing_cycle === 'yearly' ? 'YEARLY' : 'MONTHLY';
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);

    const { data: subscription } = await client.post('/subscriptions', {
      customer: customerId,
      billingType: this.mapPaymentMethod(params.payment_method),
      value,
      cycle,
      nextDueDate: nextDueDate.toISOString().split('T')[0],
      description: `Odonto SaaS — ${params.plan_name}`,
      externalReference: params.clinic_id,
    });

    const periodEnd = new Date();
    if (params.billing_cycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    return {
      gateway_subscription_id: subscription.id,
      status: subscription.status === 'ACTIVE' ? 'active' : 'pending',
      current_period_start: new Date(),
      current_period_end: periodEnd,
    };
  }

  async cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    const client = this.ensureConfigured();
    await client.delete(`/subscriptions/${gatewaySubscriptionId}`);
  }

  async parseWebhook(
    body: Buffer | string,
    headers: Record<string, string>,
  ): Promise<WebhookEvent> {
    const payload =
      typeof body === 'string' ? JSON.parse(body) : JSON.parse(body.toString());

    // Validate webhook token
    const expectedToken = this.configService.get<string>(
      'ASAAS_WEBHOOK_TOKEN',
    );
    if (expectedToken && headers['asaas-access-token'] !== expectedToken) {
      throw new Error('Invalid ASAAS webhook token');
    }

    const eventMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'payment.succeeded',
      PAYMENT_RECEIVED: 'payment.succeeded',
      PAYMENT_OVERDUE: 'payment.failed',
      PAYMENT_DELETED: 'payment.cancelled',
      PAYMENT_REFUNDED: 'payment.refunded',
      SUBSCRIPTION_CREATED: 'subscription.created',
      SUBSCRIPTION_UPDATED: 'subscription.updated',
      SUBSCRIPTION_DELETED: 'subscription.cancelled',
    };

    const type = eventMap[payload.event] || payload.event;

    return {
      type,
      gateway: 'asaas',
      gateway_event_id: payload.id,
      gateway_subscription_id: payload.payment?.subscription || undefined,
      gateway_payment_id: payload.payment?.id || undefined,
      amount: payload.payment?.value
        ? Math.round(payload.payment.value * 100)
        : undefined,
      status: payload.payment?.status?.toLowerCase() || undefined,
      metadata: {
        externalReference: payload.payment?.externalReference,
      },
      raw: payload,
    };
  }

  private mapPaymentMethod(
    method?: string,
  ): 'CREDIT_CARD' | 'PIX' | 'BOLETO' {
    switch (method) {
      case 'credit_card':
        return 'CREDIT_CARD';
      case 'pix':
        return 'PIX';
      case 'boleto':
        return 'BOLETO';
      default:
        return 'PIX';
    }
  }
}
