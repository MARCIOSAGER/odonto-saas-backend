import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/cache.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import axios from 'axios';
import * as nodemailer from 'nodemailer';

interface FindAllOptions {
  page?: number;
  limit?: number;
  status?: string;
}

@Injectable()
export class ClinicsService {
  private readonly logger = new Logger(ClinicsService.name);
  private readonly zApiClientToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly cacheService: RedisCacheService,
  ) {
    this.zApiClientToken = this.configService.get('z_api_client_token', '');
  }

  async findAll(options: FindAllOptions = {}) {
    const { page: rawPage = 1, limit: rawLimit = 10, status } = options;
    const page = Math.max(1, rawPage);
    const limit = Math.min(100, Math.max(1, rawLimit));
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [clinics, total] = await Promise.all([
      this.prisma.clinic.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: {
              patients: true,
              appointments: true,
              dentists: true,
            },
          },
        },
      }),
      this.prisma.clinic.count({ where }),
    ]);

    return {
      data: clinics,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicBrandingBySlug(slug: string) {
    return this.cacheService.getOrSet(
      `branding:slug:${slug}`,
      async () => {
        const clinic = await this.prisma.clinic.findUnique({
          where: { slug },
          select: {
            id: true,
            name: true,
            slug: true,
            logo_url: true,
            favicon_url: true,
            logo_display_mode: true,
            primary_color: true,
            secondary_color: true,
            slogan: true,
            tagline: true,
          },
        });

        if (!clinic) {
          throw new NotFoundException('Clinic not found');
        }

        return clinic;
      },
      24 * 60 * 60 * 1000, // 24 hours
    );
  }

  async findOne(id: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            patients: true,
            appointments: true,
            dentists: true,
            services: true,
          },
        },
      },
    });

    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }

    return clinic;
  }

  async findByCnpj(cnpj: string) {
    return this.prisma.clinic.findUnique({
      where: { cnpj },
    });
  }

  async create(createClinicDto: CreateClinicDto, userId: string) {
    const existing = await this.findByCnpj(createClinicDto.cnpj);

    if (existing) {
      throw new ConflictException('CNPJ already registered');
    }

    const clinic = await this.prisma.clinic.create({
      data: {
        name: createClinicDto.name,
        cnpj: createClinicDto.cnpj,
        phone: createClinicDto.phone,
        email: createClinicDto.email,
        address: createClinicDto.address,
        city: createClinicDto.city,
        state: createClinicDto.state,
        plan: createClinicDto.plan || 'basic',
        status: 'active',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Clinic',
      entityId: clinic.id,
      clinicId: clinic.id,
      userId,
      newValues: createClinicDto,
    });

    return clinic;
  }

  async update(id: string, updateClinicDto: UpdateClinicDto, userId: string) {
    const clinic = await this.findOne(id);

    if (updateClinicDto.cnpj && updateClinicDto.cnpj !== clinic.cnpj) {
      const existing = await this.findByCnpj(updateClinicDto.cnpj);
      if (existing) {
        throw new ConflictException('CNPJ already registered');
      }
    }

    const updated = await this.prisma.clinic.update({
      where: { id },
      data: updateClinicDto,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Clinic',
      entityId: id,
      clinicId: id,
      userId,
      oldValues: clinic,
      newValues: updateClinicDto,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const clinic = await this.findOne(id);

    await this.prisma.clinic.update({
      where: { id },
      data: { status: 'inactive' },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Clinic',
      entityId: id,
      clinicId: id,
      userId,
      oldValues: { status: clinic.status },
      newValues: { status: 'inactive' },
    });

    return { message: 'Clinic deactivated successfully' };
  }

  async getStats(clinicId: string) {
    return this.cacheService.getOrSet(
      `clinic:stats:${clinicId}`,
      () => this.fetchStats(clinicId),
      5 * 60 * 1000, // 5 minutes
    );
  }

  private async fetchStats(clinicId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [totalPatients, appointmentsToday, appointmentsPending, completedAppointmentsThisMonth] =
      await Promise.all([
        this.prisma.patient.count({ where: { clinic_id: clinicId, status: 'active' } }),
        this.prisma.appointment.count({
          where: {
            clinic_id: clinicId,
            date: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        }),
        this.prisma.appointment.count({
          where: { clinic_id: clinicId, status: 'scheduled' },
        }),
        this.prisma.appointment.findMany({
          where: {
            clinic_id: clinicId,
            status: 'completed',
            date: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
          include: {
            service: {
              select: { price: true },
            },
          },
        }),
      ]);

    const revenueMonth = completedAppointmentsThisMonth.reduce((total, appointment) => {
      const price = appointment.service?.price ? Number(appointment.service.price) : 0;
      return total + price;
    }, 0);

    return {
      total_patients: totalPatients,
      appointments_today: appointmentsToday,
      appointments_pending: appointmentsPending,
      revenue_month: revenueMonth,
    };
  }

  async getAiSettings(clinicId: string) {
    const settings = await this.prisma.clinicAiSettings.findUnique({
      where: { clinic_id: clinicId },
    });

    if (!settings) {
      return {
        clinic_id: clinicId,
        ai_enabled: true,
        ai_provider: 'anthropic',
        ai_api_key_masked: null,
        ai_api_key_set: false,
        ai_model: 'claude-3-5-haiku-20241022',
        ai_temperature: 0.7,
        max_tokens: 800,
        assistant_name: 'Sofia',
        assistant_personality: 'Amigável, profissional e prestativa',
        welcome_message:
          'Olá! Sou a Sofia, assistente virtual da clínica. Como posso ajudar você hoje?',
        fallback_message: 'Desculpe, não consegui entender. Pode reformular sua pergunta?',
        out_of_hours_message: 'Estamos fora do horário de atendimento. Retornaremos em breve!',
        transfer_keywords: [],
        blocked_topics: [],
        custom_instructions: null,
        context_messages: 10,
        auto_schedule: false,
        auto_confirm: false,
        auto_cancel: false,
        notify_on_transfer: true,
        working_hours_only: false,
        use_welcome_menu: false,
        use_confirmation_buttons: false,
        use_timeslot_list: false,
        use_satisfaction_poll: false,
        use_send_location: false,
        dentist_ai_enabled: false,
        reminder_enabled: true,
        reminder_24h: true,
        reminder_1h: true,
        reminder_message_24h: null,
        reminder_message_1h: null,
      };
    }

    // Mascarar a API key na resposta (nunca enviar a chave real ao frontend)
    const result = { ...settings } as any;
    if (result.ai_api_key) {
      const key = result.ai_api_key;
      result.ai_api_key_masked =
        key.length > 8 ? key.substring(0, 4) + '****' + key.substring(key.length - 4) : '****';
      result.ai_api_key_set = true;
    } else {
      result.ai_api_key_masked = null;
      result.ai_api_key_set = false;
    }
    delete result.ai_api_key;

    return result;
  }

  async getAiSettingsRaw(clinicId: string) {
    // Versão interna - retorna a API key real (para uso pelo serviço de IA)
    return this.prisma.clinicAiSettings.findUnique({
      where: { clinic_id: clinicId },
    });
  }

  async updateAiSettings(clinicId: string, updateDto: UpdateAiSettingsDto, userId: string) {
    // Verificar se a clínica existe
    await this.findOne(clinicId);

    // Se ai_api_key está vazio ou undefined, não atualizar (manter a existente)
    const updateData: any = { ...updateDto };
    if (updateDto.ai_temperature !== undefined) {
      updateData.ai_temperature = updateDto.ai_temperature;
    }
    if (!updateDto.ai_api_key) {
      delete updateData.ai_api_key;
    }

    const settings = await this.prisma.clinicAiSettings.upsert({
      where: { clinic_id: clinicId },
      update: updateData,
      create: {
        clinic_id: clinicId,
        ai_enabled: updateDto.ai_enabled ?? true,
        ai_provider: updateDto.ai_provider ?? 'anthropic',
        ai_api_key: updateDto.ai_api_key || null,
        ai_model: updateDto.ai_model ?? 'claude-3-5-haiku-20241022',
        ai_temperature: updateDto.ai_temperature ?? 0.7,
        max_tokens: updateDto.max_tokens ?? 800,
        assistant_name: updateDto.assistant_name ?? 'Sofia',
        assistant_personality: updateDto.assistant_personality,
        welcome_message: updateDto.welcome_message,
        fallback_message: updateDto.fallback_message,
        out_of_hours_message: updateDto.out_of_hours_message,
        transfer_keywords: updateDto.transfer_keywords ?? [],
        blocked_topics: updateDto.blocked_topics ?? [],
        custom_instructions: updateDto.custom_instructions,
        context_messages: updateDto.context_messages ?? 10,
        auto_schedule: updateDto.auto_schedule ?? false,
        auto_confirm: updateDto.auto_confirm ?? false,
        auto_cancel: updateDto.auto_cancel ?? false,
        notify_on_transfer: updateDto.notify_on_transfer ?? true,
        working_hours_only: updateDto.working_hours_only ?? false,
        use_welcome_menu: updateDto.use_welcome_menu ?? false,
        use_confirmation_buttons: updateDto.use_confirmation_buttons ?? false,
        use_timeslot_list: updateDto.use_timeslot_list ?? false,
        use_satisfaction_poll: updateDto.use_satisfaction_poll ?? false,
        use_send_location: updateDto.use_send_location ?? false,
        dentist_ai_enabled: updateDto.dentist_ai_enabled ?? false,
        reminder_enabled: updateDto.reminder_enabled ?? true,
        reminder_24h: updateDto.reminder_24h ?? true,
        reminder_1h: updateDto.reminder_1h ?? true,
        reminder_message_24h: updateDto.reminder_message_24h,
        reminder_message_1h: updateDto.reminder_message_1h,
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'ClinicAiSettings',
      entityId: settings.id,
      clinicId,
      userId,
      newValues: updateDto,
    });

    return settings;
  }

  async testWhatsAppConnection(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return {
        connected: false,
        message: 'Credenciais Z-API não configuradas',
      };
    }

    const clientToken = clinic.z_api_client_token || this.zApiClientToken;

    try {
      const response = await axios.get(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/status`,
        {
          timeout: 10000,
          headers: {
            'Client-Token': clientToken,
          },
        },
      );

      const connected = response.data?.connected === true;
      return {
        connected,
        message: connected ? 'WhatsApp conectado!' : 'WhatsApp desconectado. Conecte via QR Code.',
        details: response.data,
      };
    } catch (error: any) {
      const status = error?.response?.status;
      this.logger.error(`Error testing WhatsApp connection (${status}): ${error}`);

      if (status === 403) {
        return {
          connected: false,
          message: 'Client-Token inválido (403). Verifique no painel Z-API.',
        };
      }

      return {
        connected: false,
        message: 'Erro ao verificar conexão com WhatsApp',
      };
    }
  }

  async getWhatsAppQrCode(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return {
        success: false,
        message: 'Credenciais Z-API não configuradas',
      };
    }

    const clientToken = clinic.z_api_client_token || this.zApiClientToken;

    try {
      const response = await axios.get(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/qr-code/image`,
        {
          timeout: 15000,
          headers: {
            'Client-Token': clientToken,
          },
        },
      );

      return {
        success: true,
        qrcode: response.data?.value || response.data,
        message: 'QR Code gerado. Escaneie com seu WhatsApp.',
      };
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Erro desconhecido';
      this.logger.error(`Error getting WhatsApp QR Code: ${errorMsg}`);
      return {
        success: false,
        message: `Erro ao gerar QR Code: ${errorMsg}`,
      };
    }
  }

  async disconnectWhatsApp(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return { success: false, message: 'Credenciais Z-API não configuradas' };
    }

    try {
      const response = await axios.get(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/disconnect`,
        {
          timeout: 10000,
          headers: { 'Client-Token': clinic.z_api_client_token || this.zApiClientToken },
        },
      );
      return {
        success: true,
        message: 'WhatsApp desconectado com sucesso.',
        details: response.data,
      };
    } catch (error: any) {
      this.logger.error(`Error disconnecting WhatsApp: ${error}`);
      return {
        success: false,
        message: error?.response?.data?.message || 'Erro ao desconectar WhatsApp',
      };
    }
  }

  async restartWhatsApp(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return { success: false, message: 'Credenciais Z-API não configuradas' };
    }

    try {
      const response = await axios.get(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/restart`,
        {
          timeout: 15000,
          headers: { 'Client-Token': clinic.z_api_client_token || this.zApiClientToken },
        },
      );
      return {
        success: true,
        message: 'Instância reiniciada. Não é necessário escanear QR Code novamente.',
        details: response.data,
      };
    } catch (error: any) {
      this.logger.error(`Error restarting WhatsApp: ${error}`);
      return {
        success: false,
        message: error?.response?.data?.message || 'Erro ao reiniciar instância',
      };
    }
  }

  async restoreWhatsAppSession(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return { success: false, message: 'Credenciais Z-API não configuradas' };
    }

    try {
      const response = await axios.get(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/restore-session`,
        {
          timeout: 15000,
          headers: { 'Client-Token': clinic.z_api_client_token || this.zApiClientToken },
        },
      );
      return { success: true, message: 'Sessão restaurada com sucesso.', details: response.data };
    } catch (error: any) {
      this.logger.error(`Error restoring WhatsApp session: ${error}`);
      return {
        success: false,
        message: error?.response?.data?.message || 'Erro ao restaurar sessão',
      };
    }
  }

  async testAiConnection(clinicId: string) {
    const settings = await this.prisma.clinicAiSettings.findUnique({
      where: { clinic_id: clinicId },
    });

    const provider = settings?.ai_provider || 'anthropic';
    const apiKey = settings?.ai_api_key || this.configService.get('ANTHROPIC_API_KEY', '');
    const model = settings?.ai_model || 'claude-3-5-haiku-20241022';

    if (!apiKey) {
      return {
        success: false,
        message: 'Nenhuma API Key configurada. Adicione sua chave na configuração.',
        provider,
      };
    }

    try {
      if (provider === 'anthropic') {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model,
            max_tokens: 50,
            messages: [{ role: 'user', content: 'Diga apenas "OK"' }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            timeout: 15000,
          },
        );
        return {
          success: true,
          message: `Conexão com Anthropic (${model}) funcionando!`,
          provider,
          model,
          response: response.data?.content?.[0]?.text || 'OK',
        };
      }

      if (provider === 'openai') {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            max_tokens: 50,
            messages: [{ role: 'user', content: 'Diga apenas "OK"' }],
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            timeout: 15000,
          },
        );
        return {
          success: true,
          message: `Conexão com OpenAI (${model}) funcionando!`,
          provider,
          model,
          response: response.data?.choices?.[0]?.message?.content || 'OK',
        };
      }

      if (provider === 'google') {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: 'Diga apenas "OK"' }] }],
            generationConfig: { maxOutputTokens: 50 },
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
          },
        );
        return {
          success: true,
          message: `Conexão com Google Gemini (${model}) funcionando!`,
          provider,
          model,
          response: response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'OK',
        };
      }

      return { success: false, message: `Provedor desconhecido: ${provider}`, provider };
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg =
        error?.response?.data?.error?.message || error?.message || 'Erro desconhecido';
      this.logger.error(`AI test failed for ${provider} (${status}): ${errorMsg}`);

      if (status === 401 || status === 403) {
        return {
          success: false,
          message: 'API Key inválida ou sem permissão. Verifique sua chave.',
          provider,
        };
      }

      if (status === 404) {
        return {
          success: false,
          message: `Modelo "${model}" não encontrado. Verifique o modelo selecionado.`,
          provider,
        };
      }

      return {
        success: false,
        message: `Erro ao testar conexão: ${errorMsg}`,
        provider,
      };
    }
  }

  async sendTestWhatsAppMessage(clinicId: string, phone: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true, name: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return {
        success: false,
        message: 'Credenciais Z-API não configuradas',
      };
    }

    const clientToken = clinic.z_api_client_token || this.zApiClientToken;

    if (!clientToken) {
      return {
        success: false,
        message: 'Client-Token não configurado. Verifique suas credenciais Z-API.',
      };
    }

    // Z-API exige formato DDI+DDD+NUMERO (ex: 5521999999999)
    let formattedPhone = phone.replace(/\D/g, '');

    if (formattedPhone.length < 10) {
      return {
        success: false,
        message: 'Número inválido. Informe com código do país + DDD + número. Ex: 5521999999999',
      };
    }

    // Se tem 10-11 dígitos, é brasileiro sem DDI → adiciona 55
    // Se tem 12+ dígitos, assume que já tem código do país
    if (formattedPhone.length <= 11 && !formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }

    try {
      const response = await axios.post(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/send-text`,
        {
          phone: formattedPhone,
          message: `✅ Mensagem de teste do sistema ${clinic.name || 'Odonto SaaS'}. Sua integração com WhatsApp está funcionando corretamente!`,
        },
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': clientToken,
          },
        },
      );

      if (response.data?.zaapId || response.data?.messageId) {
        return {
          success: true,
          message: `Mensagem de teste enviada para ${phone}!`,
        };
      }

      return {
        success: false,
        message: 'Resposta inesperada da Z-API. Verifique se a instância está conectada.',
      };
    } catch (error: any) {
      const status = error?.response?.status;
      const errorMsg = error?.response?.data?.message || error?.message || 'Erro desconhecido';
      this.logger.error(`Error sending test WhatsApp message (${status}): ${errorMsg}`);

      if (status === 403) {
        return {
          success: false,
          message: 'Acesso negado (403). Verifique se o Client-Token está correto no painel Z-API.',
        };
      }

      if (status === 404) {
        return {
          success: false,
          message: 'Instância não encontrada (404). Verifique o Instance ID e Token.',
        };
      }

      return {
        success: false,
        message: `Erro ao enviar mensagem: ${errorMsg}`,
      };
    }
  }

  async getWhatsAppWebhooks(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return { success: false, message: 'Credenciais Z-API não configuradas' };
    }

    const clientToken = clinic.z_api_client_token || this.zApiClientToken;

    try {
      const response = await axios.get(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/webhooks`,
        { timeout: 10000, headers: { 'Client-Token': clientToken } },
      );

      return {
        success: true,
        webhooks: response.data,
      };
    } catch (error: any) {
      this.logger.error(`Error getting Z-API webhooks: ${error}`);
      return {
        success: false,
        message: error?.response?.data?.message || 'Erro ao buscar webhooks',
      };
    }
  }

  async configureWhatsAppWebhook(clinicId: string, backendUrl: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { z_api_instance: true, z_api_token: true, z_api_client_token: true },
    });

    if (!clinic?.z_api_instance || !clinic?.z_api_token) {
      return { success: false, message: 'Credenciais Z-API não configuradas' };
    }

    const clientToken = clinic.z_api_client_token || this.zApiClientToken;
    const baseUrl = `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}`;

    // URL do webhook para mensagens recebidas
    const webhookReceivedUrl = `${backendUrl}/webhooks/z-api`;
    const webhookStatusUrl = `${backendUrl}/webhooks/z-api/status`;

    const results: string[] = [];

    try {
      // Configurar webhook de mensagens recebidas
      await axios.put(
        `${baseUrl}/update-webhook-received`,
        { value: webhookReceivedUrl },
        { timeout: 10000, headers: { 'Client-Token': clientToken } },
      );
      results.push(`Webhook recebimento: ${webhookReceivedUrl}`);
    } catch (error: any) {
      this.logger.error(`Error setting received webhook: ${error}`);
      results.push(`Erro webhook recebimento: ${error?.response?.data?.message || error.message}`);
    }

    try {
      // Configurar webhook de status de mensagens
      await axios.put(
        `${baseUrl}/update-webhook-message-status`,
        { value: webhookStatusUrl },
        { timeout: 10000, headers: { 'Client-Token': clientToken } },
      );
      results.push(`Webhook status: ${webhookStatusUrl}`);
    } catch (error: any) {
      this.logger.error(`Error setting status webhook: ${error}`);
      results.push(`Erro webhook status: ${error?.response?.data?.message || error.message}`);
    }

    return {
      success: true,
      message: 'Webhooks configurados!',
      details: results,
      webhookUrl: webhookReceivedUrl,
    };
  }

  // ==========================================
  // Email / SMTP Settings
  // ==========================================

  async getEmailSettings(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        smtp_host: true,
        smtp_port: true,
        smtp_user: true,
        smtp_pass: true,
        smtp_from: true,
        smtp_secure: true,
      },
    });

    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }

    const result: any = { ...clinic };
    if (result.smtp_pass) {
      result.smtp_pass_set = true;
      result.smtp_pass_masked = '********';
    } else {
      result.smtp_pass_set = false;
      result.smtp_pass_masked = null;
    }
    delete result.smtp_pass;

    return result;
  }

  async updateEmailSettings(clinicId: string, updateDto: UpdateEmailSettingsDto, userId: string) {
    await this.findOne(clinicId);

    const updateData: any = { ...updateDto };

    // If smtp_pass is empty or undefined, don't update (keep existing)
    if (!updateDto.smtp_pass) {
      delete updateData.smtp_pass;
    }

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: updateData,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'ClinicEmailSettings',
      entityId: clinicId,
      clinicId,
      userId,
      newValues: { ...updateDto, smtp_pass: updateDto.smtp_pass ? '***' : undefined },
    });

    return this.getEmailSettings(clinicId);
  }

  async testEmailConnection(clinicId: string, userId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        smtp_host: true,
        smtp_port: true,
        smtp_user: true,
        smtp_pass: true,
        smtp_from: true,
        smtp_secure: true,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    const host = clinic?.smtp_host || this.configService.get('SMTP_HOST', 'smtp.hostinger.com');
    const port = clinic?.smtp_port || parseInt(this.configService.get('SMTP_PORT', '465'), 10);
    const secure = clinic?.smtp_secure ?? this.configService.get('SMTP_SECURE', 'true') === 'true';
    const smtpUser = clinic?.smtp_user || this.configService.get('SMTP_USER') || '';
    const smtpPass = clinic?.smtp_pass || this.configService.get('SMTP_PASS') || '';
    const from = clinic?.smtp_from || this.configService.get('SMTP_FROM') || smtpUser;

    if (!host || !smtpUser || !smtpPass) {
      return {
        success: false,
        message: 'Configuração SMTP incompleta. Preencha host, usuário e senha.',
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.verify();

      await transporter.sendMail({
        from,
        to: user.email,
        subject: 'Teste de E-mail - Odonto SaaS',
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#0EA5E9;">Teste de E-mail</h2>
          <p>Olá <strong>${user.name}</strong>,</p>
          <p>Este é um e-mail de teste. Sua configuração SMTP está funcionando corretamente!</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="color:#9ca3af;font-size:12px;">Odonto SaaS</p>
        </div>`,
      });

      return {
        success: true,
        message: `E-mail de teste enviado para ${user.email}`,
      };
    } catch (error: any) {
      this.logger.error(`SMTP test failed: ${error.message}`);

      if (error.code === 'EAUTH') {
        return { success: false, message: 'Autenticação falhou. Verifique usuário e senha SMTP.' };
      }
      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          message: `Conexão recusada em ${host}:${port}. Verifique host e porta.`,
        };
      }
      if (error.code === 'ESOCKET') {
        return {
          success: false,
          message: `Erro de conexão. Verifique se SSL/TLS está correto para a porta ${port}.`,
        };
      }

      return { success: false, message: `Erro: ${error.message}` };
    }
  }
}
