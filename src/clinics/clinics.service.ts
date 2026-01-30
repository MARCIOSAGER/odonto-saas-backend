import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import axios from 'axios';

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
  ) {
    this.zApiClientToken = this.configService.get('z_api_client_token', '');
  }

  async findAll(options: FindAllOptions = {}) {
    const { page = 1, limit = 10, status } = options;
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
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [
      totalPatients,
      appointmentsToday,
      appointmentsPending,
      completedAppointmentsThisMonth,
    ] = await Promise.all([
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

    // Calcular receita do mês baseado nos agendamentos completados
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
      // Retornar valores padrão se não existir
      return {
        clinic_id: clinicId,
        ai_enabled: true,
        ai_model: 'claude-3-5-haiku-20241022',
        ai_temperature: 0.7,
        max_tokens: 800,
        assistant_name: 'Sofia',
        assistant_personality: 'Amigável, profissional e prestativa',
        welcome_message: 'Olá! Sou a Sofia, assistente virtual da clínica. Como posso ajudar você hoje?',
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
      };
    }

    return settings;
  }

  async updateAiSettings(clinicId: string, updateDto: UpdateAiSettingsDto, userId: string) {
    // Verificar se a clínica existe
    await this.findOne(clinicId);

    const settings = await this.prisma.clinicAiSettings.upsert({
      where: { clinic_id: clinicId },
      update: {
        ...updateDto,
        ai_temperature: updateDto.ai_temperature !== undefined
          ? updateDto.ai_temperature
          : undefined,
      },
      create: {
        clinic_id: clinicId,
        ai_enabled: updateDto.ai_enabled ?? true,
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
        message: connected ? 'WhatsApp conectado!' : 'WhatsApp desconectado',
        details: response.data,
      };
    } catch (error) {
      this.logger.error(`Error testing WhatsApp connection: ${error}`);
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

    // Formatar telefone
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }

    try {
      const response = await axios.post(
        `https://api.z-api.io/instances/${clinic.z_api_instance}/token/${clinic.z_api_token}/send-text`,
        {
          phone: formattedPhone,
          message: `✅ Mensagem de teste do sistema ${clinic.name || 'Odonto SaaS'}. Sua integração com WhatsApp está funcionando corretamente!`,
          delayTyping: 2,
        },
        {
          timeout: 15000,
          headers: {
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
        message: 'Resposta inesperada da Z-API',
      };
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || error?.message || 'Erro desconhecido';
      this.logger.error(`Error sending test WhatsApp message: ${errorMsg}`);
      return {
        success: false,
        message: `Erro ao enviar mensagem: ${errorMsg}`,
      };
    }
  }
}
