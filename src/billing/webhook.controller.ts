import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { StripeGateway } from './gateways/stripe.gateway';
import { AsaasGateway } from './gateways/asaas.gateway';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly stripeGateway: StripeGateway,
    private readonly asaasGateway: AsaasGateway,
  ) {}

  @Post('stripe')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async stripeWebhook(
    @Req() req: Request,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      const event = await this.stripeGateway.parseWebhook(
        req.body as Buffer,
        headers,
      );
      await this.billingService.processWebhook(event);
      return { received: true };
    } catch (error) {
      this.logger.error('Stripe webhook error:', error);
      return { received: false, error: 'Webhook processing failed' };
    }
  }

  @Post('asaas')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async asaasWebhook(
    @Req() req: Request,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      const body =
        typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body);
      const event = await this.asaasGateway.parseWebhook(body, headers);
      await this.billingService.processWebhook(event);
      return { received: true };
    } catch (error) {
      this.logger.error('ASAAS webhook error:', error);
      return { received: false, error: 'Webhook processing failed' };
    }
  }
}
