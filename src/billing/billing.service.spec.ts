import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeGateway } from './gateways/stripe.gateway';
import { AsaasGateway } from './gateways/asaas.gateway';
import { CouponService } from './coupon.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NfseService } from './nfse/nfse.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let stripeGateway: {
    createCheckout: jest.Mock;
    name: string;
  };
  let asaasGateway: {
    createCheckout: jest.Mock;
    name: string;
  };
  let couponService: {
    validate: jest.Mock;
    apply: jest.Mock;
  };
  let subscriptionsService: {
    create: jest.Mock;
    activateFromPayment: jest.Mock;
    markPastDue: jest.Mock;
  };
  let nfseService: {
    emit: jest.Mock;
  };

  const clinicId = 'clinic-uuid-1';

  const mockPlan = {
    id: 'plan-uuid-1',
    name: 'professional',
    display_name: 'Professional',
    price_monthly: 199.9,
    price_yearly: 1999.0,
    status: 'active',
    features: {},
    created_at: new Date('2025-01-01'),
  };

  const mockClinic = {
    id: clinicId,
    name: 'Clinica Sorriso',
    email: 'contato@sorriso.com',
    cnpj: '12345678000100',
  };

  const mockSubscription = {
    id: 'sub-uuid-1',
    clinic_id: clinicId,
    plan_id: 'plan-uuid-1',
    billing_cycle: 'monthly',
    status: 'pending',
    payment_method: 'credit_card',
    payment_gateway: 'stripe',
    external_id: null,
    created_at: new Date(),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    stripeGateway = {
      createCheckout: jest.fn().mockResolvedValue({
        checkout_url: 'https://checkout.stripe.com/session-123',
        payment_id: 'cs_123',
        status: 'pending',
      }),
      name: 'stripe',
    };
    asaasGateway = {
      createCheckout: jest.fn().mockResolvedValue({
        pix_qr_code: 'base64qrcode',
        pix_copy_paste: '00020101...',
        status: 'pending',
      }),
      name: 'asaas',
    };
    couponService = {
      validate: jest.fn(),
      apply: jest.fn(),
    };
    subscriptionsService = {
      create: jest.fn().mockResolvedValue(mockSubscription),
      activateFromPayment: jest.fn().mockResolvedValue(undefined),
      markPastDue: jest.fn().mockResolvedValue(undefined),
    };
    nfseService = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeGateway, useValue: stripeGateway },
        { provide: AsaasGateway, useValue: asaasGateway },
        { provide: CouponService, useValue: couponService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: NfseService, useValue: nfseService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // checkout
  // ──────────────────────────────────────────────────
  describe('checkout', () => {
    const checkoutDto = {
      plan_id: 'plan-uuid-1',
      billing_cycle: 'monthly',
      gateway: 'stripe',
      payment_method: 'credit_card',
    };

    it('should create a checkout session via stripe', async () => {
      prisma.plan.findUnique.mockResolvedValue(mockPlan);
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);

      const result = await service.checkout(clinicId, checkoutDto as any);

      expect(result).toEqual(
        expect.objectContaining({
          subscription_id: mockSubscription.id,
          checkout_url: 'https://checkout.stripe.com/session-123',
        }),
      );
      expect(prisma.plan.findUnique).toHaveBeenCalledWith({
        where: { id: checkoutDto.plan_id },
      });
      expect(prisma.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: clinicId },
      });
      expect(subscriptionsService.create).toHaveBeenCalledWith(clinicId, {
        plan_id: checkoutDto.plan_id,
        billing_cycle: 'monthly',
        payment_method: 'credit_card',
        payment_gateway: 'stripe',
      });
      expect(stripeGateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          clinic_id: clinicId,
          plan_id: checkoutDto.plan_id,
          plan_name: mockPlan.display_name,
          amount: Math.round(mockPlan.price_monthly * 100),
          billing_cycle: 'monthly',
          customer_email: mockClinic.email,
          customer_name: mockClinic.name,
        }),
      );
    });

    it('should throw NotFoundException when plan not found', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(service.checkout(clinicId, checkoutDto as any)).rejects.toThrow(
        NotFoundException,
      );

      expect(stripeGateway.createCheckout).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when plan is inactive', async () => {
      prisma.plan.findUnique.mockResolvedValue({ ...mockPlan, status: 'inactive' });

      await expect(service.checkout(clinicId, checkoutDto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when clinic not found', async () => {
      prisma.plan.findUnique.mockResolvedValue(mockPlan);
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(service.checkout(clinicId, checkoutDto as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should apply coupon discount to the amount', async () => {
      prisma.plan.findUnique.mockResolvedValue(mockPlan);
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);
      couponService.validate.mockResolvedValue({
        code: 'SAVE20',
        discount_percent: 20,
        valid: true,
      });
      couponService.apply.mockResolvedValue(undefined);

      const dtoWithCoupon = { ...checkoutDto, coupon_code: 'SAVE20' };
      await service.checkout(clinicId, dtoWithCoupon as any);

      expect(couponService.validate).toHaveBeenCalledWith('SAVE20');
      const expectedAmount = Math.round(mockPlan.price_monthly * 100 * 0.8);
      expect(stripeGateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: expectedAmount,
          coupon_discount_percent: 20,
        }),
      );
      expect(couponService.apply).toHaveBeenCalledWith('SAVE20');
    });

    it('should use yearly price when billing_cycle is yearly', async () => {
      prisma.plan.findUnique.mockResolvedValue(mockPlan);
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);

      const yearlyDto = { ...checkoutDto, billing_cycle: 'yearly' };
      await service.checkout(clinicId, yearlyDto as any);

      expect(stripeGateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: Math.round(mockPlan.price_yearly * 100),
          billing_cycle: 'yearly',
        }),
      );
    });

    it('should create subscription directly for free plan (amount = 0 after coupon)', async () => {
      const freePlan = { ...mockPlan, price_monthly: 0, price_yearly: 0 };
      prisma.plan.findUnique.mockResolvedValue(freePlan);
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);

      const result = await service.checkout(clinicId, checkoutDto as any);

      expect(result).toEqual(
        expect.objectContaining({
          subscription: mockSubscription,
          checkout_url: null,
        }),
      );
      expect(stripeGateway.createCheckout).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // processWebhook
  // ──────────────────────────────────────────────────
  describe('processWebhook', () => {
    it('should handle payment.succeeded event', async () => {
      const mockSubWithPlan = {
        ...mockSubscription,
        clinic_id: clinicId,
        clinic: mockClinic,
        plan: { ...mockPlan, features: {} },
        payment_method: 'credit_card',
      };
      prisma.subscription.findFirst.mockResolvedValue(mockSubWithPlan);
      prisma.invoice.create.mockResolvedValue({
        id: 'invoice-uuid-1',
        number: 'INV-123',
        amount: 199.9,
        total: 199.9,
      });
      prisma.payment.create.mockResolvedValue({});

      await service.processWebhook({
        type: 'payment.succeeded',
        gateway: 'stripe',
        gateway_event_id: 'evt_123',
        gateway_subscription_id: 'sub_stripe_123',
        gateway_payment_id: 'pi_123',
        amount: 19990,
        metadata: { subscription_id: mockSubscription.id },
        raw: {},
      });

      expect(subscriptionsService.activateFromPayment).toHaveBeenCalledWith(
        clinicId,
        mockSubscription.id,
        'sub_stripe_123',
      );
      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinic_id: clinicId,
          subscription_id: mockSubscription.id,
          status: 'paid',
          payment_gateway: 'stripe',
        }),
      });
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gateway: 'stripe',
          gateway_payment_id: 'pi_123',
          status: 'confirmed',
        }),
      });
    });

    it('should handle payment.failed event and mark subscription as past_due', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      await service.processWebhook({
        type: 'payment.failed',
        gateway: 'stripe',
        gateway_event_id: 'evt_456',
        gateway_subscription_id: 'sub_stripe_123',
        metadata: {},
        raw: {},
      });

      expect(subscriptionsService.markPastDue).toHaveBeenCalledWith(
        mockSubscription.id,
      );
    });

    it('should handle subscription.cancelled event', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      prisma.subscription.update.mockResolvedValue({
        ...mockSubscription,
        status: 'cancelled',
      });

      await service.processWebhook({
        type: 'subscription.cancelled',
        gateway: 'stripe',
        gateway_event_id: 'evt_789',
        gateway_subscription_id: 'sub_stripe_123',
        metadata: {},
        raw: {},
      });

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: {
          status: 'cancelled',
          cancelled_at: expect.any(Date),
        },
      });
    });

    it('should not fail on unknown webhook event type', async () => {
      await expect(
        service.processWebhook({
          type: 'unknown.event',
          gateway: 'stripe',
          gateway_event_id: 'evt_000',
          metadata: {},
          raw: {},
        }),
      ).resolves.not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────
  // getAdminInvoices
  // ──────────────────────────────────────────────────
  describe('getAdminInvoices', () => {
    it('should return paginated invoices', async () => {
      const mockInvoices = [
        {
          id: 'inv-1',
          number: 'INV-001',
          amount: 199.9,
          total: 199.9,
          status: 'paid',
          clinic: { id: clinicId, name: 'Clinica Sorriso', cnpj: '12345678000100' },
          subscription: { plan: mockPlan },
          payments: [],
        },
      ];
      prisma.invoice.findMany.mockResolvedValue(mockInvoices);
      prisma.invoice.count.mockResolvedValue(1);

      const result = await service.getAdminInvoices(1, 20);

      expect(result).toEqual({
        data: mockInvoices,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: { created_at: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should apply status and clinic_id filters', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.invoice.count.mockResolvedValue(0);

      await service.getAdminInvoices(1, 20, {
        status: 'paid',
        clinic_id: clinicId,
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'paid', clinic_id: clinicId },
        }),
      );
    });

    it('should cap limit at 100', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.invoice.count.mockResolvedValue(0);

      const result = await service.getAdminInvoices(1, 500);

      expect(result.meta.limit).toBe(100);
    });
  });

  // ──────────────────────────────────────────────────
  // getAdminOverview
  // ──────────────────────────────────────────────────
  describe('getAdminOverview', () => {
    it('should return billing overview with MRR calculation', async () => {
      prisma.subscription.count
        .mockResolvedValueOnce(10)  // active
        .mockResolvedValueOnce(3)   // trialing
        .mockResolvedValueOnce(1);  // past_due

      prisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { total: 5000 } })  // total revenue
        .mockResolvedValueOnce({ _sum: { total: 1200 } }); // monthly revenue

      prisma.subscription.findMany.mockResolvedValue([
        {
          billing_cycle: 'monthly',
          plan: { price_monthly: 199.9, price_yearly: 1999 },
        },
        {
          billing_cycle: 'yearly',
          plan: { price_monthly: 199.9, price_yearly: 2400 },
        },
      ]);

      const result = await service.getAdminOverview();

      expect(result.active_subscriptions).toBe(10);
      expect(result.trialing_subscriptions).toBe(3);
      expect(result.past_due_subscriptions).toBe(1);
      expect(result.total_revenue).toBe(5000);
      expect(result.monthly_revenue).toBe(1200);
      // MRR = 199.9 (monthly) + 2400/12 (yearly) = 199.9 + 200 = 399.9
      expect(result.mrr).toBe(399.9);
    });

    it('should handle zero active subscriptions', async () => {
      prisma.subscription.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      prisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { total: null } })
        .mockResolvedValueOnce({ _sum: { total: null } });

      prisma.subscription.findMany.mockResolvedValue([]);

      const result = await service.getAdminOverview();

      expect(result.mrr).toBe(0);
      expect(result.active_subscriptions).toBe(0);
      expect(result.total_revenue).toBe(0);
      expect(result.monthly_revenue).toBe(0);
    });
  });
});
