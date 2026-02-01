export interface CreateCheckoutParams {
  clinic_id: string;
  plan_id: string;
  plan_name: string;
  amount: number; // in cents
  currency?: string;
  billing_cycle: 'monthly' | 'yearly';
  customer_email: string;
  customer_name: string;
  customer_document?: string; // CPF/CNPJ
  payment_method?: 'credit_card' | 'pix' | 'boleto';
  success_url?: string;
  cancel_url?: string;
  coupon_discount_percent?: number;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  checkout_url?: string; // URL for redirect-based checkout
  payment_id?: string; // Gateway payment/session ID
  pix_qr_code?: string; // PIX QR code (base64 or URL)
  pix_copy_paste?: string; // PIX copia-e-cola
  boleto_url?: string; // Boleto URL
  status: 'pending' | 'processing' | 'paid' | 'failed';
}

export interface CreateSubscriptionParams {
  clinic_id: string;
  plan_name: string;
  amount: number; // in cents
  currency?: string;
  billing_cycle: 'monthly' | 'yearly';
  customer_email: string;
  customer_name: string;
  customer_document?: string;
  payment_method?: string;
  metadata?: Record<string, string>;
}

export interface GatewaySubscriptionResult {
  gateway_subscription_id: string;
  status: string;
  current_period_start: Date;
  current_period_end: Date;
}

export interface WebhookEvent {
  type: string;
  gateway: string;
  gateway_event_id?: string;
  gateway_subscription_id?: string;
  gateway_payment_id?: string;
  amount?: number;
  status?: string;
  metadata?: Record<string, unknown>;
  raw: unknown;
}

export interface PaymentGateway {
  readonly name: string;

  /**
   * Create a checkout session (one-time or first payment)
   */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;

  /**
   * Create a recurring subscription
   */
  createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<GatewaySubscriptionResult>;

  /**
   * Cancel a subscription on the gateway
   */
  cancelSubscription(gatewaySubscriptionId: string): Promise<void>;

  /**
   * Parse and validate a webhook event
   */
  parseWebhook(body: Buffer | string, headers: Record<string, string>): Promise<WebhookEvent>;
}
