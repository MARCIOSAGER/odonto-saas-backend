import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { passwordResetTemplate } from './templates/password-reset.template';
import { welcomeTemplate } from './templates/welcome.template';
import { twoFactorCodeTemplate } from './templates/two-factor-code.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
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

  async sendPasswordResetEmail(to: string, name: string, resetLink: string): Promise<boolean> {
    const html = passwordResetTemplate(name, resetLink);
    return this.sendMail(to, 'Redefinir sua senha', html);
  }

  async sendWelcomeEmail(to: string, name: string, clinicName: string): Promise<boolean> {
    const html = welcomeTemplate(name, clinicName);
    return this.sendMail(to, 'Bem-vindo ao Odonto SaaS!', html);
  }

  async sendTwoFactorCode(to: string, name: string, code: string): Promise<boolean> {
    const html = twoFactorCodeTemplate(name, code);
    return this.sendMail(to, 'Seu código de verificação', html);
  }
}
