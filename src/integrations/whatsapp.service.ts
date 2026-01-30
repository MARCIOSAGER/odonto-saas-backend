import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { PrismaService } from '../prisma/prisma.service';

interface SendMessageOptions {
  delayTyping?: number;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly defaultApiUrl: string;
  private readonly defaultToken: string;
  private readonly clientToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.defaultApiUrl = this.configService.get('Z_API_URL', '');
    this.defaultToken = this.configService.get('Z_API_TOKEN', '');
    this.clientToken = this.configService.get('z_api_client_token', '');
  }

  async sendMessage(
    clinicId: string,
    phone: string,
    message: string,
    options: SendMessageOptions = {},
  ): Promise<boolean> {
    try {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
      });

      const instanceId = clinic?.z_api_instance;
      const token = clinic?.z_api_token || this.defaultToken;
      const clientToken = clinic?.z_api_client_token || this.clientToken;

      if (!instanceId || !token) {
        this.logger.warn(`WhatsApp not configured for clinic ${clinicId}`);
        return false;
      }

      const formattedPhone = this.formatPhone(phone);

      const url = `${this.defaultApiUrl}/instances/${instanceId}/token/${token}/send-text`;

      const response = await axios.post(url, {
        phone: formattedPhone,
        message,
        delayTyping: options.delayTyping || 2,
      }, {
        headers: { 'Client-Token': clientToken },
      });

      if (response.data?.zaapId || response.data?.messageId) {
        this.logger.log(`Message sent successfully to ${formattedPhone}`);
        return true;
      }

      this.logger.warn(`Unexpected response from Z-API: ${JSON.stringify(response.data)}`);
      return false;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Failed to send WhatsApp message: ${error.response?.data?.message || error.message}`,
        );
      } else {
        this.logger.error(`Failed to send WhatsApp message: ${error}`);
      }
      return false;
    }
  }

  async sendTemplate(
    clinicId: string,
    phone: string,
    templateName: string,
    params: Record<string, string>,
  ): Promise<boolean> {
    const templates: Record<string, (p: Record<string, string>) => string> = {
      appointment_reminder: (p) =>
        `Olá ${p.patientName}! Lembramos que você tem uma consulta agendada para ${p.date} às ${p.time} na ${p.clinicName}. Por favor, confirme sua presença respondendo SIM ou NÃO.`,
      appointment_confirmed: (p) =>
        `✅ Sua consulta foi confirmada!\n\nData: ${p.date}\nHorário: ${p.time}\nServiço: ${p.service}\n\nAguardamos você na ${p.clinicName}!`,
      appointment_cancelled: (p) =>
        `Sua consulta do dia ${p.date} às ${p.time} foi cancelada. Para reagendar, entre em contato conosco.`,
      welcome: (p) =>
        `Olá ${p.patientName}! Seja bem-vindo(a) à ${p.clinicName}! Sou a Sofia, sua assistente virtual. Como posso ajudar?`,
    };

    const template = templates[templateName];
    if (!template) {
      this.logger.warn(`Template not found: ${templateName}`);
      return false;
    }

    const message = template(params);
    return this.sendMessage(clinicId, phone, message);
  }

  async sendAppointmentReminder(
    clinicId: string,
    phone: string,
    appointmentDetails: {
      patientName: string;
      date: string;
      time: string;
      service: string;
      clinicName: string;
    },
  ): Promise<boolean> {
    return this.sendTemplate(clinicId, phone, 'appointment_reminder', appointmentDetails);
  }

  async sendAppointmentConfirmation(
    clinicId: string,
    phone: string,
    appointmentDetails: {
      date: string;
      time: string;
      service: string;
      clinicName: string;
    },
  ): Promise<boolean> {
    return this.sendTemplate(clinicId, phone, 'appointment_confirmed', appointmentDetails);
  }

  // ============================================
  // INTERACTIVE MESSAGES (Z-API)
  // ============================================

  async sendList(
    clinicId: string,
    phone: string,
    data: {
      message: string;
      title: string;
      buttonLabel: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    },
  ): Promise<boolean> {
    try {
      const config = await this.getClinicZApiConfig(clinicId);
      if (!config) return false;

      const formattedPhone = this.formatPhone(phone);
      const url = `${this.defaultApiUrl}/instances/${config.instanceId}/token/${config.token}/send-option-list`;

      const response = await axios.post(url, {
        phone: formattedPhone,
        message: data.message,
        optionList: {
          title: data.title,
          buttonLabel: data.buttonLabel,
          options: data.sections,
        },
      }, {
        headers: { 'Client-Token': config.clientToken },
      });

      if (response.data?.zaapId || response.data?.messageId) {
        this.logger.log(`List message sent to ${formattedPhone}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`Failed to send list message: ${error.message}`);
      return false;
    }
  }

  async sendButtons(
    clinicId: string,
    phone: string,
    data: {
      message: string;
      buttons: Array<{ id: string; label: string }>;
    },
  ): Promise<boolean> {
    try {
      const config = await this.getClinicZApiConfig(clinicId);
      if (!config) return false;

      const formattedPhone = this.formatPhone(phone);
      const url = `${this.defaultApiUrl}/instances/${config.instanceId}/token/${config.token}/send-button-list`;

      const response = await axios.post(url, {
        phone: formattedPhone,
        message: data.message,
        buttons: data.buttons.map((b) => ({ id: b.id, label: b.label })),
      }, {
        headers: { 'Client-Token': config.clientToken },
      });

      if (response.data?.zaapId || response.data?.messageId) {
        this.logger.log(`Button message sent to ${formattedPhone}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`Failed to send button message: ${error.message}`);
      return false;
    }
  }

  async sendPoll(
    clinicId: string,
    phone: string,
    data: {
      question: string;
      options: string[];
    },
  ): Promise<boolean> {
    try {
      const config = await this.getClinicZApiConfig(clinicId);
      if (!config) return false;

      const formattedPhone = this.formatPhone(phone);
      const url = `${this.defaultApiUrl}/instances/${config.instanceId}/token/${config.token}/send-poll`;

      const response = await axios.post(url, {
        phone: formattedPhone,
        poll: {
          name: data.question,
          options: data.options,
          allowMultipleAnswers: false,
        },
      }, {
        headers: { 'Client-Token': config.clientToken },
      });

      if (response.data?.zaapId || response.data?.messageId) {
        this.logger.log(`Poll sent to ${formattedPhone}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`Failed to send poll: ${error.message}`);
      return false;
    }
  }

  async sendLocation(
    clinicId: string,
    phone: string,
    data: {
      latitude: number;
      longitude: number;
      name: string;
      address: string;
    },
  ): Promise<boolean> {
    try {
      const config = await this.getClinicZApiConfig(clinicId);
      if (!config) return false;

      const formattedPhone = this.formatPhone(phone);
      const url = `${this.defaultApiUrl}/instances/${config.instanceId}/token/${config.token}/send-location`;

      const response = await axios.post(url, {
        phone: formattedPhone,
        latitude: data.latitude,
        longitude: data.longitude,
        name: data.name,
        address: data.address,
      }, {
        headers: { 'Client-Token': config.clientToken },
      });

      if (response.data?.zaapId || response.data?.messageId) {
        this.logger.log(`Location sent to ${formattedPhone}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(`Failed to send location: ${error.message}`);
      return false;
    }
  }

  // ============================================
  // CONNECTION & HELPERS
  // ============================================

  private async getClinicZApiConfig(clinicId: string): Promise<{
    instanceId: string;
    token: string;
    clientToken: string;
  } | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    const instanceId = clinic?.z_api_instance;
    const token = clinic?.z_api_token || this.defaultToken;
    const clientToken = clinic?.z_api_client_token || this.clientToken;

    if (!instanceId || !token) {
      this.logger.warn(`WhatsApp not configured for clinic ${clinicId}`);
      return null;
    }

    return { instanceId, token, clientToken };
  }

  async checkConnection(clinicId: string): Promise<boolean> {
    try {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
      });

      if (!clinic?.z_api_instance || !clinic?.z_api_token) {
        return false;
      }

      const clientToken = clinic.z_api_client_token || this.clientToken;
      const url = `${this.defaultApiUrl}/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/status`;
      const response = await axios.get(url, {
        headers: { 'Client-Token': clientToken },
      });

      return response.data?.connected === true;
    } catch (error) {
      this.logger.error(`Failed to check WhatsApp connection: ${error}`);
      return false;
    }
  }

  private formatPhone(phone: string): string {
    let formatted = phone.replace(/\D/g, '');

    // Se tem 10-11 dígitos, é brasileiro sem DDI → adiciona 55
    // Se tem 12+ dígitos, assume que já tem código do país
    if (formatted.length <= 11 && !formatted.startsWith('55')) {
      formatted = '55' + formatted;
    }

    return formatted;
  }
}
