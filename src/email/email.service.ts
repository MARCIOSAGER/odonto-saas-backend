import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import * as nodemailer from 'nodemailer';
import { passwordResetTemplate } from './templates/password-reset.template';
import { welcomeTemplate } from './templates/welcome.template';
import { twoFactorCodeTemplate } from './templates/two-factor-code.template';
import { appointmentReminderTemplate } from './templates/appointment-reminder.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly queueService?: QueueService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', 'smtp.hostinger.com'),
      port: parseInt(this.configService.get('SMTP_PORT', '465'), 10),
      secure: this.configService.get('SMTP_SECURE', 'true') === 'true',
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  private async getTransporterForClinic(clinicId: string): Promise<{ transporter: nodemailer.Transporter; from: string }> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { smtp_host: true, smtp_port: true, smtp_user: true, smtp_pass: true, smtp_from: true, smtp_secure: true },
    });

    if (clinic?.smtp_host && clinic?.smtp_user && clinic?.smtp_pass) {
      const transporter = nodemailer.createTransport({
        host: clinic.smtp_host,
        port: clinic.smtp_port || 465,
        secure: clinic.smtp_secure ?? true,
        auth: { user: clinic.smtp_user, pass: clinic.smtp_pass },
      });
      const from = clinic.smtp_from || clinic.smtp_user;
      return { transporter, from };
    }

    const from = this.configService.get('SMTP_FROM', this.configService.get('SMTP_USER'));
    return { transporter: this.transporter, from };
  }

  async sendMail(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const from = this.configService.get('SMTP_FROM', this.configService.get('SMTP_USER'));
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
      return false;
    }
  }

  async sendMailForClinic(clinicId: string, to: string, subject: string, html: string): Promise<boolean> {
    try {
      const { transporter, from } = await this.getTransporterForClinic(clinicId);
      await transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent to ${to} (clinic ${clinicId}): ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to} (clinic ${clinicId}): ${error}`);
      return false;
    }
  }

  async sendPasswordResetEmail(to: string, name: string, resetLink: string, clinicId?: string): Promise<boolean> {
    if (this.queueService?.isEnabled) {
      return this.queueService.addEmailJob({ type: 'password-reset', to, name, resetLink, clinicId });
    }
    const html = passwordResetTemplate(name, resetLink);
    if (clinicId) {
      return this.sendMailForClinic(clinicId, to, 'Redefinir sua senha', html);
    }
    return this.sendMail(to, 'Redefinir sua senha', html);
  }

  async sendWelcomeEmail(to: string, name: string, clinicName: string, clinicId?: string): Promise<boolean> {
    if (this.queueService?.isEnabled) {
      return this.queueService.addEmailJob({ type: 'welcome', to, name, clinicName, clinicId });
    }
    const html = welcomeTemplate(name, clinicName);
    if (clinicId) {
      return this.sendMailForClinic(clinicId, to, 'Bem-vindo ao Odonto SaaS!', html);
    }
    return this.sendMail(to, 'Bem-vindo ao Odonto SaaS!', html);
  }

  async sendTwoFactorCode(to: string, name: string, code: string, clinicId?: string): Promise<boolean> {
    if (this.queueService?.isEnabled) {
      return this.queueService.addEmailJob({ type: '2fa-code', to, name, code, clinicId });
    }
    const html = twoFactorCodeTemplate(name, code);
    if (clinicId) {
      return this.sendMailForClinic(clinicId, to, 'Seu código de verificação', html);
    }
    return this.sendMail(to, 'Seu código de verificação', html);
  }

  async sendAppointmentReminder(
    clinicId: string,
    to: string,
    patientName: string,
    clinicName: string,
    date: string,
    time: string,
    serviceName: string,
    dentistName: string,
  ): Promise<boolean> {
    if (this.queueService?.isEnabled) {
      return this.queueService.addEmailJob({
        type: 'appointment-reminder',
        to,
        clinicId,
        patientName,
        clinicName,
        date,
        time,
        serviceName,
        dentistName,
      });
    }
    const html = appointmentReminderTemplate(patientName, clinicName, date, time, serviceName, dentistName);
    return this.sendMailForClinic(clinicId, to, `Lembrete: Consulta em ${date} às ${time}`, html);
  }
}
