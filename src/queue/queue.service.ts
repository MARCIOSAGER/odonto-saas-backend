import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_EMAIL, QUEUE_WHATSAPP, QUEUE_PDF } from './queue.constants';

export interface EmailJobData {
  type: 'generic' | 'password-reset' | 'welcome' | '2fa-code' | 'appointment-reminder';
  to: string;
  subject?: string;
  html?: string;
  clinicId?: string;
  // Type-specific fields
  name?: string;
  resetLink?: string;
  clinicName?: string;
  code?: string;
  patientName?: string;
  date?: string;
  time?: string;
  serviceName?: string;
  dentistName?: string;
}

export interface WhatsAppJobData {
  type: 'message' | 'template' | 'appointment-reminder' | 'appointment-confirmation';
  clinicId: string;
  phone: string;
  message?: string;
  template?: string;
  params?: Record<string, string>;
}

export interface PdfJobData {
  prescriptionId: string;
  clinicId: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  readonly isEnabled: boolean;

  constructor(
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_WHATSAPP) private readonly whatsappQueue: Queue,
    @InjectQueue(QUEUE_PDF) private readonly pdfQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.isEnabled = !!this.configService.get('REDIS_HOST');
    if (this.isEnabled) {
      this.logger.log('Queue system enabled (Redis connected)');
    } else {
      this.logger.warn('Queue system disabled (no REDIS_HOST configured) — jobs run synchronously');
    }
  }

  async addEmailJob(data: EmailJobData): Promise<boolean> {
    if (!this.isEnabled) return false;
    try {
      await this.emailQueue.add('send-email', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to enqueue email job: ${error}`);
      return false;
    }
  }

  async addWhatsAppJob(data: WhatsAppJobData): Promise<boolean> {
    if (!this.isEnabled) return false;
    try {
      await this.whatsappQueue.add('send-whatsapp', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to enqueue WhatsApp job: ${error}`);
      return false;
    }
  }

  async addPdfJob(data: PdfJobData): Promise<boolean> {
    if (!this.isEnabled) return false;
    try {
      await this.pdfQueue.add('generate-pdf', data, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to enqueue PDF job: ${error}`);
      return false;
    }
  }
}
