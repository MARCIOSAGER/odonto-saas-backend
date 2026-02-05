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
  // Interactive message responses
  buttonResponse?: {
    selectedButtonId: string;
    selectedButtonText: string;
  };
  listResponse?: {
    selectedRowId: string;
    title: string;
    description?: string;
  };
  pollResponse?: {
    selectedOptions: string[];
  };
  participant?: string;
  chatName?: string;
  type?: string;
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
  @ApiHeader({ name: 'client-token', required: false, description: 'Z-API client token' })
  async handleZApiWebhook(
    @Body() payload: ZApiWebhookPayload,
    @Headers('x-instance-id') instanceId?: string,
    @Headers('client-token') clientToken?: string,
  ) {
    const effectiveInstanceId = payload.instanceId || instanceId;
    this.logger.log(`Received Z-API webhook from instance: ${effectiveInstanceId}`);

    try {
      // Verify webhook client token against clinic's stored token
      const isValid = await this.zApiService.verifyWebhookToken(effectiveInstanceId, clientToken);
      if (!isValid) {
        this.logger.warn(
          `Z-API webhook rejected: invalid token for instance ${effectiveInstanceId}`,
        );
        return { status: 'rejected', reason: 'Invalid webhook token' };
      }

      if (payload.fromMe) {
        return { status: 'ignored', reason: 'Message from self' };
      }

      if (payload.isGroup) {
        return { status: 'ignored', reason: 'Group message' };
      }

      // Extrair texto da mensagem (texto normal, resposta de botão, ou resposta de lista)
      const messageText = this.extractMessageText(payload);

      if (!payload.phone || !messageText) {
        this.logger.debug('Ignoring non-text webhook');
        return { status: 'ignored', reason: 'Not a processable message' };
      }

      const result = await this.zApiService.processMessage(
        effectiveInstanceId,
        payload.phone,
        messageText,
        {
          messageId: payload.messageId,
          chatName: payload.chatName,
        },
      );

      return { status: 'processed', result };
    } catch (error) {
      this.logger.error(
        `Error processing webhook. InstanceId: ${instanceId}, MessageId: ${payload.messageId || 'unknown'}, Phone: ${payload.phone || 'unknown'}, ChatName: ${payload.chatName || 'unknown'}, Error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      );
      return { status: 'error', message: 'Failed to process webhook' };
    }
  }

  /**
   * Extrai o texto da mensagem de diferentes tipos de webhook.
   * Suporta: texto normal, resposta de botão, resposta de lista.
   */
  private extractMessageText(payload: ZApiWebhookPayload): string | null {
    // Texto normal
    if (payload.text?.message) {
      return payload.text.message;
    }

    // Resposta de botão interativo
    if (payload.buttonResponse) {
      this.logger.log(
        `Button response: ${payload.buttonResponse.selectedButtonId} - ${payload.buttonResponse.selectedButtonText}`,
      );
      return payload.buttonResponse.selectedButtonText;
    }

    // Resposta de lista interativa
    if (payload.listResponse) {
      this.logger.log(
        `List response: ${payload.listResponse.selectedRowId} - ${payload.listResponse.title}`,
      );
      return payload.listResponse.title;
    }

    // Resposta de pesquisa/enquete
    if (payload.pollResponse) {
      this.logger.log(`Poll response: ${JSON.stringify(payload.pollResponse.selectedOptions)}`);
      return `Resposta da pesquisa: ${payload.pollResponse.selectedOptions.join(', ')}`;
    }

    return null;
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
