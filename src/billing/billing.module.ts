import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { WebhookController } from './webhook.controller';
import { BillingService } from './billing.service';
import { CouponService } from './coupon.service';
import { StripeGateway } from './gateways/stripe.gateway';
import { AsaasGateway } from './gateways/asaas.gateway';
import { NfseService } from './nfse/nfse.service';
import { PlanLimitGuard } from './guards/plan-limit.guard';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [BillingController, WebhookController],
  providers: [
    BillingService,
    CouponService,
    StripeGateway,
    AsaasGateway,
    NfseService,
    PlanLimitGuard,
  ],
  exports: [
    BillingService,
    CouponService,
    NfseService,
    PlanLimitGuard,
    StripeGateway,
    AsaasGateway,
  ],
})
export class BillingModule {}
