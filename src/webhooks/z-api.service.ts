import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../integrations/ai.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { EncryptionService } from '../common/encryption/encryption.service';

interface MessageContext {
  messageId?: string;
  chatName?: string;
}

@Injectable()
export class ZApiService {
  private readonly logger = new Logger(ZApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly whatsappService: WhatsAppService,
    private readonly encryption: EncryptionService,
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

    // Verifica se o remetente é um dentista da clínica
    const dentist = await this.findDentistByPhone(clinic.id, normalizedPhone);

    if (dentist) {
      return this.processDentistMessage(clinic, dentist, normalizedPhone, message);
    }

    // Fluxo normal de paciente
    // Busca ou cria paciente
    const patient = await this.findOrCreatePatient(clinic.id, normalizedPhone, context.chatName);

    // Carrega contexto completo para a IA
    const fullContext = await this.buildFullContext(clinic, patient, normalizedPhone);

    // Processa com IA (multi-provedor: usa configurações da clínica)
    const aiResponse = await this.aiService.processMessage(
      clinic.id,
      message,
      fullContext,
      patient.id,
    );

    if (aiResponse) {
      // Tenta enviar como mensagem interativa; se não for JSON, envia como texto
      const logText = await this.sendInteractiveOrText(clinic.id, normalizedPhone, aiResponse);

      // Salva resposta enviada (versão texto para log)
      await this.logMessage(clinic.id, normalizedPhone, 'outgoing', logText);

      // Salva no histórico de conversação
      await this.saveConversationLog(patient.id, message, logText);
    }

    return {
      processed: true,
      clinicId: clinic.id,
      patientId: patient.id,
      responseGenerated: !!aiResponse,
    };
  }

  /**
   * Tenta parsear a resposta da IA como JSON interativo.
   * Se for JSON com campo "type", envia como mensagem interativa.
   * Caso contrário, envia como texto normal.
   * Retorna o texto para logging.
   */
  private async sendInteractiveOrText(
    clinicId: string,
    phone: string,
    aiResponse: string,
  ): Promise<string> {
    try {
      const trimmed = aiResponse.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);

        if (parsed.type && typeof parsed.type === 'string') {
          const sent = await this.dispatchInteractiveMessage(clinicId, phone, parsed);
          if (sent) {
            // Retorna versão texto para log
            return this.interactiveToLogText(parsed);
          }
          // Se falhou, envia como texto fallback
          this.logger.warn('Interactive message failed, falling back to text');
        }
      }
    } catch {
      // Não é JSON válido, envia como texto normal
    }

    await this.whatsappService.sendMessage(clinicId, phone, aiResponse);
    return aiResponse;
  }

  private async dispatchInteractiveMessage(
    clinicId: string,
    phone: string,
    parsed: any,
  ): Promise<boolean> {
    switch (parsed.type) {
      case 'list':
        return this.whatsappService.sendList(clinicId, phone, {
          message: parsed.message || '',
          title: parsed.title || 'Opções',
          buttonLabel: parsed.buttonLabel || 'Ver opções',
          sections: parsed.sections || [],
        });

      case 'buttons':
        return this.whatsappService.sendButtons(clinicId, phone, {
          message: parsed.message || '',
          buttons: parsed.buttons || [],
        });

      case 'poll':
        return this.whatsappService.sendPoll(clinicId, phone, {
          question: parsed.question || '',
          options: parsed.options || [],
        });

      case 'location':
        return this.whatsappService.sendLocation(clinicId, phone, {
          latitude: parsed.latitude || 0,
          longitude: parsed.longitude || 0,
          name: parsed.name || '',
          address: parsed.address || '',
        });

      default:
        return false;
    }
  }

  private interactiveToLogText(parsed: any): string {
    switch (parsed.type) {
      case 'list': {
        let text = parsed.message || '';
        const sections = parsed.sections || [];
        sections.forEach((section: any) => {
          text += `\n\n${section.title}:`;
          (section.rows || []).forEach((row: any) => {
            text += `\n- ${row.title}${row.description ? ` (${row.description})` : ''}`;
          });
        });
        return text;
      }
      case 'buttons': {
        let text = parsed.message || '';
        text += '\n\nOpções:';
        (parsed.buttons || []).forEach((b: any) => {
          text += `\n- ${b.label}`;
        });
        return text;
      }
      case 'poll':
        return `[Pesquisa] ${parsed.question}\nOpções: ${(parsed.options || []).join(', ')}`;
      case 'location':
        return `[Localização] ${parsed.name} - ${parsed.address}`;
      default:
        return JSON.stringify(parsed);
    }
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

    // Monta endereço completo se disponível
    const addressParts = [clinic.address, clinic.city, clinic.state].filter(Boolean);
    const clinicAddress = addressParts.length > 0 ? addressParts.join(', ') : undefined;

    return {
      // Clínica
      clinicName: clinic.name,
      clinicPhone: clinic.phone,
      clinicAddress,
      clinicWebsite: clinic.website || undefined,
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
    // Gera hoje + próximos 3 dias úteis
    const slots: { date: string; slots: string[] }[] = [];
    const businessSlots = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Começa pelo dia de hoje
    const currentDate = new Date(now);
    let daysAdded = 0;
    let isFirstIteration = true;

    while (daysAdded < 4) {
      if (!isFirstIteration) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      isFirstIteration = false;

      const dayOfWeek = currentDate.getDay();

      // Pula domingo (0)
      if (dayOfWeek === 0) continue;

      // Sábado tem horário reduzido
      const daySlots = dayOfWeek === 6 ? ['08:00', '09:00', '10:00', '11:00'] : [...businessSlots];

      // Para hoje: filtra horários que já passaram (mínimo 1h de antecedência)
      const isToday = currentDate.toDateString() === now.toDateString();
      const availableSlots = isToday
        ? daySlots.filter((slot) => {
            const [h, m] = slot.split(':').map(Number);
            return h > currentHour + 1 || (h === currentHour + 1 && m > currentMinute);
          })
        : daySlots;

      // Se hoje e não sobrou nenhum horário, pula
      if (isToday && availableSlots.length === 0) {
        daysAdded++;
        continue;
      }

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

      const label = isToday
        ? 'hoje'
        : currentDate.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
          });

      slots.push({
        date: label,
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
    // Tenta encontrar paciente existente via blind index
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneHash = this.encryption.hmac(phoneDigits);

    let patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone_hash: phoneHash,
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
      // Busca paciente para vincular via blind index
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneHash = this.encryption.hmac(phoneDigits);
      const patient = await this.prisma.patient.findFirst({
        where: { clinic_id: clinicId, phone_hash: phoneHash },
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

  // ============================================
  // DENTIST INTERACTION
  // ============================================

  private async findDentistByPhone(clinicId: string, phone: string) {
    // Busca dentista pelo telefone via blind index (com e sem código do país)
    const phoneDigits = phone.replace(/\D/g, '');
    const hash1 = this.encryption.hmac(phoneDigits);
    const hash2 = this.encryption.hmac(`55${phoneDigits}`);

    const dentist = await this.prisma.dentist.findFirst({
      where: {
        clinic_id: clinicId,
        status: 'active',
        phone_hash: { in: [hash1, hash2] },
      },
    });
    return dentist;
  }

  private async processDentistMessage(clinic: any, dentist: any, phone: string, message: string) {
    // Verifica se dentist_ai_enabled está ativado
    const aiSettings = await this.prisma.clinicAiSettings.findUnique({
      where: { clinic_id: clinic.id },
    });

    if (!aiSettings?.dentist_ai_enabled) {
      this.logger.debug(`Dentist AI not enabled for clinic ${clinic.id}, treating as patient`);
      // Se não habilitado, trata como paciente normal
      const patient = await this.findOrCreatePatient(clinic.id, phone);
      const fullContext = await this.buildFullContext(clinic, patient, phone);
      const aiResponse = await this.aiService.processMessage(
        clinic.id,
        message,
        fullContext,
        patient.id,
      );
      if (aiResponse) {
        const logText = await this.sendInteractiveOrText(clinic.id, phone, aiResponse);
        await this.logMessage(clinic.id, phone, 'outgoing', logText);
        await this.saveConversationLog(patient.id, message, logText);
      }
      return { processed: true, clinicId: clinic.id, isDentist: false };
    }

    this.logger.log(`Processing dentist message: Dr. ${dentist.name} (${phone})`);

    // Montar resposta direta baseada na mensagem do dentista
    const response = await this.handleDentistRequest(clinic, dentist, message);

    if (response) {
      await this.whatsappService.sendMessage(clinic.id, phone, response);
      await this.logMessage(clinic.id, phone, 'outgoing', response);
    }

    return {
      processed: true,
      clinicId: clinic.id,
      dentistId: dentist.id,
      isDentist: true,
    };
  }

  private async handleDentistRequest(clinic: any, dentist: any, message: string): Promise<string> {
    const lower = message.toLowerCase().trim();

    // Agenda de hoje
    if (lower.match(/agenda|hoje|meus pacientes|pacientes de hoje|compromissos/)) {
      return this.getDentistTodaySchedule(clinic.id, dentist);
    }

    // Agenda da semana
    if (lower.match(/semana|proximos dias|essa semana|próximos/)) {
      return this.getDentistWeekSchedule(clinic.id, dentist);
    }

    // Próximo paciente
    if (lower.match(/proximo|próximo|next|agora/)) {
      return this.getDentistNextPatient(clinic.id, dentist);
    }

    // Cancelar consulta
    if (lower.match(/cancelar|cancela|desmarcar/)) {
      return this.handleDentistCancel(clinic.id, dentist, message);
    }

    // Reagendar
    if (lower.match(/reagendar|remarcar|adiar/)) {
      return `Dr(a). ${dentist.name}, para reagendar uma consulta, por favor informe o nome do paciente e a nova data/horário desejado.\n\nExemplo: "Reagendar João Silva para 05/02 às 14:00"`;
    }

    // Menu de ajuda
    return (
      `Ola Dr(a). ${dentist.name}! Sou a assistente da ${clinic.name}.\n\n` +
      `Posso ajudar com:\n` +
      `- "agenda" - Ver consultas de hoje\n` +
      `- "semana" - Ver consultas da semana\n` +
      `- "proximo" - Ver proximo paciente\n` +
      `- "cancelar [paciente]" - Cancelar consulta\n` +
      `- "reagendar" - Reagendar consulta\n\n` +
      `O que precisa?`
    );
  }

  private async getDentistTodaySchedule(clinicId: string, dentist: any): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        dentist_id: dentist.id,
        date: today,
        status: { notIn: ['cancelled'] },
      },
      orderBy: { time: 'asc' },
      include: {
        patient: { select: { name: true, phone: true } },
        service: { select: { name: true } },
      },
    });

    if (appointments.length === 0) {
      return `Dr(a). ${dentist.name}, voce nao tem consultas agendadas para hoje.`;
    }

    let response = `Dr(a). ${dentist.name}, sua agenda de hoje:\n`;
    appointments.forEach((apt, i) => {
      const status = this.translateStatus(apt.status);
      response += `\n${i + 1}. ${apt.time} - ${apt.patient.name}\n   ${apt.service.name} (${status})`;
    });
    response += `\n\nTotal: ${appointments.length} consulta(s)`;

    return response;
  }

  private async getDentistWeekSchedule(clinicId: string, dentist: any): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        dentist_id: dentist.id,
        date: { gte: today, lt: endOfWeek },
        status: { notIn: ['cancelled'] },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: {
        patient: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    if (appointments.length === 0) {
      return `Dr(a). ${dentist.name}, voce nao tem consultas agendadas para os proximos 7 dias.`;
    }

    let response = `Dr(a). ${dentist.name}, sua agenda dos proximos 7 dias:\n`;
    let lastDate = '';
    appointments.forEach((apt) => {
      const dateStr = new Date(apt.date).toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });
      if (dateStr !== lastDate) {
        response += `\n${dateStr}:`;
        lastDate = dateStr;
      }
      response += `\n  ${apt.time} - ${apt.patient.name} (${apt.service.name})`;
    });
    response += `\n\nTotal: ${appointments.length} consulta(s)`;

    return response;
  }

  private async getDentistNextPatient(clinicId: string, dentist: any): Promise<string> {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const nextApt = await this.prisma.appointment.findFirst({
      where: {
        clinic_id: clinicId,
        dentist_id: dentist.id,
        date: today,
        time: { gte: currentTime },
        status: { notIn: ['cancelled'] },
      },
      orderBy: { time: 'asc' },
      include: {
        patient: { select: { name: true, phone: true } },
        service: { select: { name: true, duration: true } },
      },
    });

    if (!nextApt) {
      return `Dr(a). ${dentist.name}, voce nao tem mais consultas para hoje.`;
    }

    return (
      `Dr(a). ${dentist.name}, seu proximo paciente:\n\n` +
      `Paciente: ${nextApt.patient.name}\n` +
      `Horario: ${nextApt.time}\n` +
      `Servico: ${nextApt.service.name} (${nextApt.service.duration} min)\n` +
      `Status: ${this.translateStatus(nextApt.status)}`
    );
  }

  private async handleDentistCancel(
    clinicId: string,
    dentist: any,
    message: string,
  ): Promise<string> {
    // Tenta extrair nome do paciente da mensagem
    // Formato esperado: "cancelar João Silva" ou "cancela consulta do João"
    const lower = message.toLowerCase();
    const match = lower.match(/cancelar\s+(?:consulta\s+(?:do|da|de)\s+)?(.+)/i);

    if (!match || !match[1]) {
      // Sem nome - mostra consultas de hoje para escolher
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const appointments = await this.prisma.appointment.findMany({
        where: {
          clinic_id: clinicId,
          dentist_id: dentist.id,
          date: { gte: today },
          status: { in: ['scheduled', 'confirmed'] },
        },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        take: 5,
        include: {
          patient: { select: { name: true } },
          service: { select: { name: true } },
        },
      });

      if (appointments.length === 0) {
        return `Dr(a). ${dentist.name}, voce nao tem consultas pendentes para cancelar.`;
      }

      let response = `Dr(a). ${dentist.name}, informe qual consulta deseja cancelar:\n`;
      appointments.forEach((apt) => {
        const dateStr = new Date(apt.date).toLocaleDateString('pt-BR');
        response += `\n- ${apt.patient.name} - ${dateStr} as ${apt.time} (${apt.service.name})`;
      });
      response += `\n\nResponda: "cancelar [nome do paciente]"`;
      return response;
    }

    const patientName = match[1].trim();

    // Busca consulta futura do paciente com esse dentista
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        clinic_id: clinicId,
        dentist_id: dentist.id,
        date: { gte: today },
        status: { in: ['scheduled', 'confirmed'] },
        patient: {
          name: { contains: patientName, mode: 'insensitive' },
        },
      },
      orderBy: { date: 'asc' },
      include: {
        patient: { select: { name: true, phone: true } },
        service: { select: { name: true } },
      },
    });

    if (!appointment) {
      return `Dr(a). ${dentist.name}, nao encontrei consulta pendente para "${patientName}". Verifique o nome e tente novamente.`;
    }

    // Cancela a consulta
    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'cancelled',
        cancel_reason: `Cancelado pelo dentista Dr(a). ${dentist.name} via WhatsApp`,
        cancelled_at: new Date(),
      },
    });

    const dateStr = new Date(appointment.date).toLocaleDateString('pt-BR');

    // Notifica o paciente sobre o cancelamento
    if (appointment.patient.phone) {
      const patientMsg =
        `Ola ${appointment.patient.name}!\n\n` +
        `Infelizmente precisamos cancelar sua consulta:\n` +
        `Data: ${dateStr} as ${appointment.time}\n` +
        `Servico: ${appointment.service.name}\n\n` +
        `Por favor, entre em contato para reagendar. Desculpe pelo inconveniente!`;
      await this.whatsappService.sendMessage(clinicId, appointment.patient.phone, patientMsg);
    }

    return (
      `Consulta cancelada com sucesso!\n\n` +
      `Paciente: ${appointment.patient.name}\n` +
      `Data: ${dateStr} as ${appointment.time}\n` +
      `Servico: ${appointment.service.name}\n\n` +
      `O paciente foi notificado sobre o cancelamento.`
    );
  }

  // ============================================
  // UTILITIES
  // ============================================

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
