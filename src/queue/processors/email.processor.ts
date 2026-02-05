import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from '../../email/email.service';
import { EmailJobData } from '../queue.service';
import { QUEUE_EMAIL } from '../queue.constants';

@Processor(QUEUE_EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<boolean> {
    const { data } = job;
    this.logger.log(`Processing email job ${job.id}: type=${data.type} to=${data.to}`);

    switch (data.type) {
      case 'password-reset':
        return this.emailService.sendPasswordResetEmail(
          data.to,
          data.name || '',
          data.resetLink || '',
          data.clinicId,
        );

      case 'welcome':
        return this.emailService.sendWelcomeEmail(
          data.to,
          data.name || '',
          data.clinicName || '',
          data.clinicId,
        );

      case '2fa-code':
        return this.emailService.sendTwoFactorCode(
          data.to,
          data.name || '',
          data.code || '',
          data.clinicId,
        );

      case 'appointment-reminder':
        return this.emailService.sendAppointmentReminder(
          data.clinicId || '',
          data.to,
          data.patientName || '',
          data.clinicName || '',
          data.date || '',
          data.time || '',
          data.serviceName || '',
          data.dentistName || '',
        );

      case 'generic':
      default:
        if (data.clinicId) {
          return this.emailService.sendMailForClinic(
            data.clinicId,
            data.to,
            data.subject || '',
            data.html || '',
          );
        }
        return this.emailService.sendMail(data.to, data.subject || '', data.html || '');
    }
  }
}
