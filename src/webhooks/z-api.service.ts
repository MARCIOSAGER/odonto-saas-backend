import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../integrations/claude.service';
import { WhatsAppService } from '../integrations/whatsapp.service';

interface MessageContext {
  messageId?: string;
  chatName?: string;
}

@Injectable()
export class ZApiService {
  private readonly logger = new Logger(ZApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeService: ClaudeService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async processMessage(
    instanceId: string | undefined,
    phone: string,
    message: string,
    context: MessageContext,
  ) {
    const normalizedPhone = this.normalizePhone(phone);

    // Busca clínica pela instância Z-API
    const clinic = await this.findClinicByInstance(instanceId);

    if (!clinic) {
      this.logger.warn(`No clinic found for instance: ${instanceId}`);
      return { processed: false, reason: 'Clinic not found' };
    }

    this.logger.log(`Processing message for clinic: ${clinic.name} from: ${normalizedPhone}`);

    // Salva mensagem recebida
    await this.logMessage(clinic.id, normalizedPhone, 'incoming', message, context.messageId);

    // Busca ou cria paciente
    const patient = await this.findOrCreatePatient(clinic.id, normalizedPhone, context.chatName);

    // Carrega contexto completo para a IA
    const fullContext = await this.buildFullContext(clinic, patient, normalizedPhone);

    // Processa com IA
    const aiResponse = await this.claudeService.processMessage(message, fullContext);

    if (aiResponse) {
      // Envia resposta via WhatsApp
      await this.whatsappService.sendMessage(clinic.id, normalizedPhone, aiResponse);

      // Salva resposta enviada
      await this.logMessage(clinic.id, normalizedPhone, 'outgoing', aiResponse);

      // Salva no histórico de conversação
      await this.saveConversationLog(patient.id, message, aiResponse);
    }

    return {
      processed: true,
      clinicId: clinic.id,
      patientId: patient.id,
      responseGenerated: !!aiResponse,
    };
  }

  private async buildFullContext(clinic: any, patient: any, phone: string) {
    // Busca histórico de agendamentos do paciente
    const patientHistory = await this.getPatientHistory(clinic.id, patient.id);

    // Busca serviços da clínica
    const services = await this.getClinicServices(clinic.id);

    // Busca dentistas da clínica
    const dentists = await this.getClinicDentists(clinic.id);

    // Busca horários disponíveis (próximos 3 dias)
    const availableSlots = await this.getAvailableSlots(clinic.id);

    // Busca histórico da conversa (últimas mensagens)
    const conversationHistory = await this.getConversationHistory(patient.id);

    return {
      // Clínica
      clinicName: clinic.name,
      clinicPhone: clinic.phone,
      businessHours: clinic.business_hours,

      // Paciente
      patientName: patient.name,
      patientPhone: phone,

      // Histórico do paciente
      patientHistory,

      // Serviços e preços
      services,

      // Dentistas
      dentists,

      // Horários disponíveis
      availableSlots,

      // Histórico da conversa
      conversationHistory,
    };
  }

  private async getPatientHistory(clinicId: string, patientId: string) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        patient_id: patientId,
      },
      orderBy: { date: 'desc' },
      take: 10,
      include: {
        service: { select: { name: true } },
        dentist: { select: { name: true } },
      },
    });

    const now = new Date();
    const upcomingAppointments = appointments.filter(
      (a) => new Date(a.date) >= now && a.status !== 'cancelled',
    );

    return {
      totalAppointments: appointments.length,
      upcomingAppointments: upcomingAppointments.map((a) => ({
        date: new Date(a.date).toLocaleDateString('pt-BR'),
        time: a.time,
        service: a.service.name,
        dentist: a.dentist?.name,
        status: this.translateStatus(a.status),
      })),
      lastAppointment: appointments[0]
        ? {
            date: new Date(appointments[0].date).toLocaleDateString('pt-BR'),
            service: appointments[0].service.name,
          }
        : null,
    };
  }

  private async getClinicServices(clinicId: string) {
    const services = await this.prisma.service.findMany({
      where: {
        clinic_id: clinicId,
        status: 'active',
      },
      orderBy: { name: 'asc' },
    });

    return services.map((s) => ({
      name: s.name,
      price: Number(s.price),
      duration: s.duration,
    }));
  }

  private async getClinicDentists(clinicId: string) {
    const dentists = await this.prisma.dentist.findMany({
      where: {
        clinic_id: clinicId,
        status: 'active',
      },
      orderBy: { name: 'asc' },
    });

    return dentists.map((d) => ({
      name: d.name,
      specialty: d.specialty ?? undefined,
    }));
  }

  private async getAvailableSlots(clinicId: string) {
    // Gera próximos 3 dias úteis
    const slots: { date: string; slots: string[] }[] = [];
    const businessSlots = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

    const today = new Date();
    let daysAdded = 0;
    const currentDate = new Date(today);

    while (daysAdded < 3) {
      currentDate.setDate(currentDate.getDate() + 1);
      const dayOfWeek = currentDate.getDay();

      // Pula domingo (0)
      if (dayOfWeek === 0) continue;

      // Sábado tem horário reduzido
      const availableSlots =
        dayOfWeek === 6 ? ['08:00', '09:00', '10:00', '11:00'] : [...businessSlots];

      // Busca agendamentos existentes neste dia
      const dateStr = currentDate.toISOString().split('T')[0];
      const existingAppointments = await this.prisma.appointment.findMany({
        where: {
          clinic_id: clinicId,
          date: new Date(dateStr),
          status: { notIn: ['cancelled'] },
        },
        select: { time: true },
      });

      const bookedTimes = existingAppointments.map((a) => a.time);
      const freeSlots = availableSlots.filter((slot) => !bookedTimes.includes(slot));

      slots.push({
        date: currentDate.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
        }),
        slots: freeSlots,
      });

      daysAdded++;
    }

    return slots;
  }

  private async getConversationHistory(patientId: string) {
    const logs = await this.prisma.conversationLog.findMany({
      where: { patient_id: patientId },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    // Inverte para ordem cronológica e formata
    const history: { role: 'user' | 'assistant'; content: string; timestamp: Date }[] = [];

    logs.reverse().forEach((log) => {
      history.push({
        role: 'user',
        content: log.message,
        timestamp: log.timestamp,
      });
      history.push({
        role: 'assistant',
        content: log.response,
        timestamp: log.timestamp,
      });
    });

    return history;
  }

  private async saveConversationLog(patientId: string, message: string, response: string) {
    try {
      await this.prisma.conversationLog.create({
        data: {
          patient_id: patientId,
          message,
          response,
          intent: this.detectIntent(message),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to save conversation log: ${error}`);
    }
  }

  private detectIntent(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.match(/agendar|marcar|consulta|horário/)) return 'scheduling';
    if (lowerMessage.match(/preço|valor|quanto|custo/)) return 'pricing';
    if (lowerMessage.match(/confirmar|confirmação/)) return 'confirmation';
    if (lowerMessage.match(/cancelar|desmarcar/)) return 'cancellation';
    if (lowerMessage.match(/remarcar|reagendar/)) return 'rescheduling';
    if (lowerMessage.match(/olá|oi|bom dia|boa tarde/)) return 'greeting';

    return 'general';
  }

  private translateStatus(status: string): string {
    const translations: Record<string, string> = {
      scheduled: 'Agendado',
      confirmed: 'Confirmado',
      cancelled: 'Cancelado',
      completed: 'Realizado',
      'no-show': 'Não compareceu',
    };
    return translations[status] || status;
  }

  private async findClinicByInstance(instanceId?: string) {
    if (!instanceId) return null;

    return this.prisma.clinic.findFirst({
      where: {
        z_api_instance: instanceId,
        status: 'active',
      },
    });
  }

  private async findOrCreatePatient(clinicId: string, phone: string, name?: string) {
    // Tenta encontrar paciente existente
    let patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone: phone,
      },
    });

    // Se não existe, cria novo
    if (!patient) {
      patient = await this.prisma.patient.create({
        data: {
          clinic_id: clinicId,
          phone: phone,
          name: name || `Paciente ${phone.slice(-4)}`,
          status: 'active',
        },
      });
      this.logger.log(`New patient created: ${patient.id}`);
    }

    return patient;
  }

  private async logMessage(
    clinicId: string,
    phone: string,
    direction: 'incoming' | 'outgoing',
    message: string,
    messageId?: string,
  ) {
    try {
      // Busca paciente para vincular
      const patient = await this.prisma.patient.findFirst({
        where: { clinic_id: clinicId, phone },
      });

      await this.prisma.whatsAppMessage.create({
        data: {
          clinic_id: clinicId,
          patient_id: patient?.id,
          phone,
          direction,
          message,
          message_id: messageId,
          status: 'sent',
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log message: ${error}`);
    }
  }

  private normalizePhone(phone: string): string {
    let normalized = phone;

    // Remove sufixo do WhatsApp primeiro (antes de remover caracteres não-numéricos)
    if (normalized.endsWith('@c.us')) {
      normalized = normalized.replace('@c.us', '');
    }

    // Remove todos os caracteres não-numéricos
    normalized = normalized.replace(/\D/g, '');

    // Remove código do país se presente
    if (normalized.startsWith('55') && normalized.length > 11) {
      normalized = normalized.substring(2);
    }

    return normalized;
  }
}
