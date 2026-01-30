import { Controller, Post, Body, Headers, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ZApiService } from './z-api.service';

interface ZApiWebhookPayload {
  phone: string;
  instanceId: string;
  messageId: string;
  fromMe: boolean;
  mompitiousentType: string;
  isGroup: boolean;
  text?: {
    message: string;
  };
  image?: {
    imageUrl: string;
    caption?: string;
  };
  audio?: {
    audioUrl: string;
  };
  document?: {
    documentUrl: string;
    fileName: string;
  };
  participant?: string;
  chatName?: string;
}

@ApiTags('webhooks')
@Controller('webhooks')
@SkipThrottle()
export class ZApiController {
  private readonly logger = new Logger(ZApiController.name);

  constructor(private readonly zApiService: ZApiService) {}

  @Post('zapi')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Z-API WhatsApp webhook receiver' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiHeader({ name: 'x-instance-id', required: false, description: 'Z-API instance ID' })
  async handleZApiWebhook(
    @Body() payload: ZApiWebhookPayload,
    @Headers('x-instance-id') instanceId?: string,
  ) {
    this.logger.log(`Received Z-API webhook from instance: ${instanceId || payload.instanceId}`);
    this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

    try {
      // Ignorar webhooks que não são mensagens de texto recebidas
      if (!payload.phone || !payload.text?.message) {
        this.logger.debug('Ignoring non-text webhook');
        return { status: 'ignored', reason: 'Not a text message' };
      }

      if (payload.fromMe) {
        return { status: 'ignored', reason: 'Message from self' };
      }

      if (payload.isGroup) {
        return { status: 'ignored', reason: 'Group message' };
      }

      const result = await this.zApiService.processMessage(
        payload.instanceId || instanceId,
        payload.phone,
        payload.text.message,
        {
          messageId: payload.messageId,
          chatName: payload.chatName,
        },
      );

      return { status: 'processed', result };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error}`);
      return { status: 'error', message: 'Failed to process webhook' };
    }
  }

  @Post('zapi/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Z-API status webhook' })
  @ApiResponse({ status: 200, description: 'Status received' })
  async handleStatusWebhook(@Body() payload: Record<string, unknown>) {
    this.logger.log(`Status webhook received: ${JSON.stringify(payload)}`);
    return { status: 'received' };
  }
}
