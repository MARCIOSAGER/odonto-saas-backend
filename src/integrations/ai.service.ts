import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import { RedisCacheService } from '../cache/cache.service';
import { buildDentalAssistantPrompt } from '../ai/prompts/dental-assistant.prompt';
import axios from 'axios';

export interface ServiceInfo {
  name: string;
  price: number;
  duration: number;
}

export interface AppointmentInfo {
  date: string;
  time: string;
  service: string;
  dentist?: string;
  status: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface PatientContext {
  clinicName: string;
  clinicPhone?: string;
  clinicAddress?: string;
  clinicWebsite?: string;
  businessHours?: string;
  patientName: string;
  patientPhone: string;
  patientHistory: {
    totalAppointments: number;
    upcomingAppointments: AppointmentInfo[];
    lastAppointment: { date: string; service: string } | null;
  };
  services: ServiceInfo[];
  availableSlots: {
    date: string;
    slots: string[];
  }[];
  conversationHistory: ConversationMessage[];
  dentists: {
    name: string;
    specialty?: string;
  }[];
}

interface AiSettings {
  ai_provider: string;
  ai_api_key: string | null;
  ai_model: string;
  ai_temperature: number;
  max_tokens: number;
  assistant_name: string;
  assistant_personality: string | null;
  welcome_message: string | null;
  fallback_message: string | null;
  custom_instructions: string | null;
  context_messages: number;
  blocked_topics: string[];
  transfer_keywords: string[];
  auto_schedule: boolean;
  auto_confirm: boolean;
  auto_cancel: boolean;
  // Interactive messages
  use_welcome_menu: boolean;
  use_confirmation_buttons: boolean;
  use_timeslot_list: boolean;
  use_satisfaction_poll: boolean;
  use_send_location: boolean;
  clinic_latitude?: string;
  clinic_longitude?: string;
  // Dentist AI
  dentist_ai_enabled: boolean;
}

// ============================================
// TOOL DEFINITIONS
// ============================================

const TOOL_CREATE_APPOINTMENT = {
  name: 'create_appointment',
  description:
    'Cria um novo agendamento/consulta para o paciente. Use SOMENTE quando o paciente confirmar data, horário e serviço.',
  input_schema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'Data do agendamento no formato YYYY-MM-DD',
      },
      time: {
        type: 'string',
        description: 'Horário do agendamento no formato HH:MM',
      },
      service_name: {
        type: 'string',
        description: 'Nome do serviço (ex: Limpeza, Clareamento)',
      },
      dentist_name: {
        type: 'string',
        description: 'Nome do dentista (opcional, se o paciente escolheu)',
      },
    },
    required: ['date', 'time', 'service_name'],
  },
};

const TOOL_CONFIRM_APPOINTMENT = {
  name: 'confirm_appointment',
  description: 'Confirma uma consulta agendada do paciente (muda status para confirmado).',
  input_schema: {
    type: 'object' as const,
    properties: {
      appointment_date: {
        type: 'string',
        description: 'Data da consulta no formato YYYY-MM-DD',
      },
      appointment_time: {
        type: 'string',
        description: 'Horário da consulta no formato HH:MM (opcional)',
      },
    },
    required: ['appointment_date'],
  },
};

const TOOL_CANCEL_APPOINTMENT = {
  name: 'cancel_appointment',
  description: 'Cancela uma consulta agendada do paciente.',
  input_schema: {
    type: 'object' as const,
    properties: {
      appointment_date: {
        type: 'string',
        description: 'Data da consulta no formato YYYY-MM-DD',
      },
      appointment_time: {
        type: 'string',
        description: 'Horário da consulta no formato HH:MM (opcional)',
      },
      reason: {
        type: 'string',
        description: 'Motivo do cancelamento',
      },
    },
    required: ['appointment_date'],
  },
};

const TOOL_UPDATE_PATIENT = {
  name: 'update_patient',
  description:
    'Atualiza os dados cadastrais do paciente. Use quando o paciente informar seu nome completo, email ou data de nascimento.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Nome completo do paciente',
      },
      email: {
        type: 'string',
        description: 'Email do paciente',
      },
      birth_date: {
        type: 'string',
        description: 'Data de nascimento no formato YYYY-MM-DD',
      },
    },
    required: [] as string[],
  },
};

const FIVE_MINUTES = 5 * 60 * 1000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly defaultApiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsappService: WhatsAppService,
    private readonly cacheService: RedisCacheService,
  ) {
    this.defaultApiKey = this.configService.get('ANTHROPIC_API_KEY', '');
  }

  async processMessage(
    clinicId: string,
    userMessage: string,
    context: PatientContext,
    patientId?: string,
  ): Promise<string | null> {
    const settings = await this.getClinicAiSettings(clinicId);

    const provider = settings.ai_provider;
    const apiKey = settings.ai_api_key || (provider === 'anthropic' ? this.defaultApiKey : '');

    if (!apiKey) {
      this.logger.warn(`No API key for provider ${provider} in clinic ${clinicId}`);
      return this.getFallbackResponse(userMessage, context, settings);
    }

    try {
      const systemPrompt = this.buildSystemPrompt(context, settings);
      const messages: any[] = [
        ...context.conversationHistory.slice(-(settings.context_messages || 10)).map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: userMessage },
      ];

      // Montar lista de tools baseado nas configurações da clínica
      const tools = this.getEnabledTools(settings);

      this.logger.debug(
        `Sending to ${provider} (${settings.ai_model}) with ${messages.length} messages, ${tools.length} tools`,
      );

      if (provider === 'anthropic') {
        return await this.callAnthropicWithTools(
          apiKey,
          settings,
          systemPrompt,
          messages,
          tools,
          clinicId,
          patientId,
        );
      }

      if (provider === 'openai') {
        return await this.callOpenAIWithTools(
          apiKey,
          settings,
          systemPrompt,
          messages,
          tools,
          clinicId,
          patientId,
        );
      }

      if (provider === 'google') {
        return await this.callGoogle(apiKey, settings, systemPrompt, messages);
      }

      this.logger.warn(`Unknown provider: ${provider}, falling back`);
      return this.getFallbackResponse(userMessage, context, settings);
    } catch (error: any) {
      this.logger.error(`AI API error (${provider}): ${error.message}`);
      if (error.response) {
        this.logger.error(`Response: ${JSON.stringify(error.response.data)}`);
      }
      return this.getFallbackResponse(userMessage, context, settings);
    }
  }

  // ============================================
  // TOOL CONFIGURATION
  // ============================================

  private getEnabledTools(settings: AiSettings): any[] {
    const tools: any[] = [TOOL_UPDATE_PATIENT];
    if (settings.auto_schedule) tools.push(TOOL_CREATE_APPOINTMENT);
    if (settings.auto_confirm) tools.push(TOOL_CONFIRM_APPOINTMENT);
    if (settings.auto_cancel) tools.push(TOOL_CANCEL_APPOINTMENT);
    return tools;
  }

  // ============================================
  // ANTHROPIC (Claude) - com Tool Use
  // ============================================

  private async callAnthropicWithTools(
    apiKey: string,
    settings: AiSettings,
    systemPrompt: string,
    messages: any[],
    tools: any[],
    clinicId: string,
    patientId?: string,
  ): Promise<string | null> {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };

    const body: any = {
      model: settings.ai_model,
      max_tokens: settings.max_tokens,
      temperature: settings.ai_temperature,
      system: systemPrompt,
      messages,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    const response = await axios.post('https://api.anthropic.com/v1/messages', body, {
      headers,
      timeout: 60000,
    });

    const content = response.data?.content || [];
    const stopReason = response.data?.stop_reason;

    // Se a IA quer usar uma ferramenta
    if (stopReason === 'tool_use') {
      return await this.handleAnthropicToolUse(
        apiKey,
        settings,
        systemPrompt,
        messages,
        tools,
        content,
        clinicId,
        patientId,
      );
    }

    // Resposta normal (só texto)
    const textBlock = content.find((block: any) => block.type === 'text');
    return textBlock?.text || null;
  }

  private async handleAnthropicToolUse(
    apiKey: string,
    settings: AiSettings,
    systemPrompt: string,
    messages: any[],
    tools: any[],
    assistantContent: any[],
    clinicId: string,
    patientId?: string,
  ): Promise<string | null> {
    // Adicionar a resposta do assistente (com tool_use) ao histórico
    const updatedMessages = [...messages, { role: 'assistant', content: assistantContent }];

    // Executar cada tool_use e coletar resultados
    const toolResults: any[] = [];
    for (const block of assistantContent) {
      if (block.type === 'tool_use') {
        this.logger.log(`Executing tool: ${block.name} with input: ${JSON.stringify(block.input)}`);
        const result = await this.executeTool(block.name, block.input, clinicId, patientId);
        this.logger.log(`Tool result: ${JSON.stringify(result)}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Enviar resultados das ferramentas de volta para a IA
    updatedMessages.push({ role: 'user', content: toolResults });

    const body: any = {
      model: settings.ai_model,
      max_tokens: settings.max_tokens,
      temperature: settings.ai_temperature,
      system: systemPrompt,
      messages: updatedMessages,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    const response = await axios.post('https://api.anthropic.com/v1/messages', body, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 60000,
    });

    const finalContent = response.data?.content || [];
    const textBlock = finalContent.find((block: any) => block.type === 'text');
    return textBlock?.text || null;
  }

  // ============================================
  // OPENAI (GPT) - com Function Calling
  // ============================================

  private async callOpenAIWithTools(
    apiKey: string,
    settings: AiSettings,
    systemPrompt: string,
    messages: any[],
    tools: any[],
    clinicId: string,
    patientId?: string,
  ): Promise<string | null> {
    const openaiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    const body: any = {
      model: settings.ai_model,
      max_tokens: settings.max_tokens,
      temperature: settings.ai_temperature,
      messages: openaiMessages,
    };

    // Converter tools para formato OpenAI
    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    const response = await axios.post('https://api.openai.com/v1/chat/completions', body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 60000,
    });

    const choice = response.data?.choices?.[0];
    const msg = choice?.message;

    // Se a IA quer usar tools
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      return await this.handleOpenAIToolUse(
        apiKey,
        settings,
        openaiMessages,
        body.tools,
        msg,
        clinicId,
        patientId,
      );
    }

    return msg?.content || null;
  }

  private async handleOpenAIToolUse(
    apiKey: string,
    settings: AiSettings,
    messages: any[],
    tools: any[],
    assistantMessage: any,
    clinicId: string,
    patientId?: string,
  ): Promise<string | null> {
    const updatedMessages = [...messages, assistantMessage];

    for (const toolCall of assistantMessage.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      this.logger.log(`OpenAI tool: ${toolCall.function.name} with args: ${JSON.stringify(args)}`);
      const result = await this.executeTool(toolCall.function.name, args, clinicId, patientId);
      this.logger.log(`Tool result: ${JSON.stringify(result)}`);
      updatedMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: settings.ai_model,
        max_tokens: settings.max_tokens,
        temperature: settings.ai_temperature,
        messages: updatedMessages,
        tools,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
      },
    );

    return response.data?.choices?.[0]?.message?.content || null;
  }

  // ============================================
  // GOOGLE (Gemini) - sem tools por enquanto
  // ============================================

  private async callGoogle(
    apiKey: string,
    settings: AiSettings,
    systemPrompt: string,
    messages: { role: string; content: string }[],
  ): Promise<string | null> {
    const contents = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${settings.ai_model}:generateContent?key=${apiKey}`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: settings.max_tokens,
          temperature: settings.ai_temperature,
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      },
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }

  // ============================================
  // TOOL EXECUTION
  // ============================================

  private async executeTool(
    toolName: string,
    input: any,
    clinicId: string,
    patientId?: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      switch (toolName) {
        case 'create_appointment':
          return await this.toolCreateAppointment(clinicId, patientId, input);
        case 'confirm_appointment':
          return await this.toolConfirmAppointment(clinicId, patientId, input);
        case 'cancel_appointment':
          return await this.toolCancelAppointment(clinicId, patientId, input);
        case 'update_patient':
          return await this.toolUpdatePatient(clinicId, patientId, input);
        default:
          return { success: false, message: `Ferramenta desconhecida: ${toolName}` };
      }
    } catch (error: any) {
      this.logger.error(`Tool execution error (${toolName}): ${error.message}`);
      return { success: false, message: `Erro ao executar: ${error.message}` };
    }
  }

  private async toolCreateAppointment(
    clinicId: string,
    patientId: string | undefined,
    input: { date: string; time: string; service_name: string; dentist_name?: string },
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (!patientId) {
      return { success: false, message: 'Paciente não identificado. Não é possível agendar.' };
    }

    // Buscar serviço pelo nome
    const service = await this.prisma.service.findFirst({
      where: {
        clinic_id: clinicId,
        name: { contains: input.service_name, mode: 'insensitive' },
        status: 'active',
      },
    });

    if (!service) {
      return {
        success: false,
        message: `Serviço "${input.service_name}" não encontrado. Verifique o nome do serviço.`,
      };
    }

    // Buscar dentista (opcional)
    let dentistId: string | null = null;
    if (input.dentist_name) {
      const dentist = await this.prisma.dentist.findFirst({
        where: {
          clinic_id: clinicId,
          name: { contains: input.dentist_name, mode: 'insensitive' },
          status: 'active',
        },
      });
      if (dentist) {
        dentistId = dentist.id;
      }
    }

    // Se não especificou dentista, pegar o primeiro disponível
    if (!dentistId) {
      const anyDentist = await this.prisma.dentist.findFirst({
        where: { clinic_id: clinicId, status: 'active' },
      });
      if (anyDentist) {
        dentistId = anyDentist.id;
      }
    }

    // Verificar se o horário está disponível
    const appointmentDate = new Date(input.date + 'T00:00:00');
    const existing = await this.prisma.appointment.findFirst({
      where: {
        clinic_id: clinicId,
        date: appointmentDate,
        time: input.time,
        status: { notIn: ['cancelled'] },
      },
    });

    if (existing) {
      return {
        success: false,
        message: `O horário ${input.time} do dia ${input.date} já está ocupado. Sugira outro horário.`,
      };
    }

    // Criar o agendamento
    const appointment = await this.prisma.appointment.create({
      data: {
        clinic_id: clinicId,
        patient_id: patientId,
        service_id: service.id,
        dentist_id: dentistId,
        date: appointmentDate,
        time: input.time,
        duration: service.duration,
        status: 'scheduled',
      },
      include: {
        service: { select: { name: true, price: true } },
        dentist: { select: { name: true, phone: true } },
        patient: { select: { name: true } },
        clinic: { select: { name: true } },
      },
    });

    // Notificar dentista via WhatsApp
    await this.notifyDentist(clinicId, appointment.dentist, {
      type: 'new_appointment',
      patientName: appointment.patient.name,
      date: appointmentDate.toLocaleDateString('pt-BR'),
      time: input.time,
      service: appointment.service.name,
      clinicName: appointment.clinic.name,
    });

    return {
      success: true,
      message: `Agendamento criado com sucesso!`,
      data: {
        id: appointment.id,
        date: input.date,
        time: input.time,
        service: appointment.service.name,
        price: Number(appointment.service.price),
        dentist: appointment.dentist?.name || 'A definir',
        duration: appointment.duration,
      },
    };
  }

  private async toolConfirmAppointment(
    clinicId: string,
    patientId: string | undefined,
    input: { appointment_date: string; appointment_time?: string },
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (!patientId) {
      return { success: false, message: 'Paciente não identificado.' };
    }

    const appointmentDate = new Date(input.appointment_date + 'T00:00:00');

    const where: any = {
      clinic_id: clinicId,
      patient_id: patientId,
      date: appointmentDate,
      status: 'scheduled',
    };
    if (input.appointment_time) {
      where.time = input.appointment_time;
    }

    const appointment = await this.prisma.appointment.findFirst({
      where,
      include: {
        service: { select: { name: true } },
        dentist: { select: { name: true, phone: true } },
        patient: { select: { name: true } },
        clinic: { select: { name: true } },
      },
    });

    if (!appointment) {
      return {
        success: false,
        message: `Nenhuma consulta agendada encontrada para ${input.appointment_date}${input.appointment_time ? ' às ' + input.appointment_time : ''}.`,
      };
    }

    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'confirmed',
        confirmed_at: new Date(),
      },
    });

    // Notificar dentista via WhatsApp
    await this.notifyDentist(clinicId, appointment.dentist, {
      type: 'confirmed_appointment',
      patientName: appointment.patient.name,
      date: appointmentDate.toLocaleDateString('pt-BR'),
      time: appointment.time,
      service: appointment.service.name,
      clinicName: appointment.clinic.name,
    });

    return {
      success: true,
      message: `Consulta confirmada!`,
      data: {
        date: input.appointment_date,
        time: appointment.time,
        service: appointment.service.name,
      },
    };
  }

  private async toolCancelAppointment(
    clinicId: string,
    patientId: string | undefined,
    input: { appointment_date: string; appointment_time?: string; reason?: string },
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (!patientId) {
      return { success: false, message: 'Paciente não identificado.' };
    }

    const appointmentDate = new Date(input.appointment_date + 'T00:00:00');

    const where: any = {
      clinic_id: clinicId,
      patient_id: patientId,
      date: appointmentDate,
      status: { in: ['scheduled', 'confirmed'] },
    };
    if (input.appointment_time) {
      where.time = input.appointment_time;
    }

    const appointment = await this.prisma.appointment.findFirst({
      where,
      include: {
        service: { select: { name: true } },
      },
    });

    if (!appointment) {
      return {
        success: false,
        message: `Nenhuma consulta encontrada para cancelar em ${input.appointment_date}.`,
      };
    }

    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'cancelled',
        cancel_reason: input.reason || 'Cancelado pelo paciente via WhatsApp',
        cancelled_at: new Date(),
      },
    });

    return {
      success: true,
      message: `Consulta cancelada.`,
      data: {
        date: input.appointment_date,
        time: appointment.time,
        service: appointment.service.name,
      },
    };
  }

  private async toolUpdatePatient(
    clinicId: string,
    patientId: string | undefined,
    input: { name?: string; email?: string; birth_date?: string },
  ): Promise<{ success: boolean; message: string; data?: any }> {
    if (!patientId) {
      return { success: false, message: 'Paciente não identificado.' };
    }

    const updateData: any = {};
    if (input.name) updateData.name = input.name;
    if (input.email) updateData.email = input.email;
    if (input.birth_date) updateData.birth_date = new Date(input.birth_date + 'T00:00:00');

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: 'Nenhum dado para atualizar.' };
    }

    await this.prisma.patient.update({
      where: { id: patientId },
      data: updateData,
    });

    const updatedFields = Object.keys(updateData).map((k) => {
      const labels: Record<string, string> = {
        name: 'Nome',
        email: 'Email',
        birth_date: 'Data de nascimento',
      };
      return labels[k] || k;
    });

    return {
      success: true,
      message: `Dados atualizados: ${updatedFields.join(', ')}.`,
      data: updateData,
    };
  }

  // ============================================
  // DENTIST NOTIFICATIONS
  // ============================================

  private async notifyDentist(
    clinicId: string,
    dentist: { name: string; phone: string | null } | null,
    details: {
      type: 'new_appointment' | 'confirmed_appointment';
      patientName: string;
      date: string;
      time: string;
      service: string;
      clinicName: string;
    },
  ): Promise<void> {
    try {
      if (!dentist || !dentist.phone) {
        this.logger.debug('Dentist has no phone number, skipping WhatsApp notification');
        return;
      }

      const phone = dentist.phone;
      const dentistName = dentist.name;

      let message: string;

      if (details.type === 'new_appointment') {
        message =
          `Ola Dr(a). ${dentistName}!\n\n` +
          `Novo agendamento na ${details.clinicName}:\n\n` +
          `Paciente: ${details.patientName}\n` +
          `Data: ${details.date}\n` +
          `Horario: ${details.time}\n` +
          `Servico: ${details.service}\n\n` +
          `O paciente agendou via WhatsApp.`;
      } else {
        message =
          `Ola Dr(a). ${dentistName}!\n\n` +
          `Consulta confirmada na ${details.clinicName}:\n\n` +
          `Paciente: ${details.patientName}\n` +
          `Data: ${details.date}\n` +
          `Horario: ${details.time}\n` +
          `Servico: ${details.service}\n\n` +
          `O paciente confirmou presenca via WhatsApp.`;
      }

      const sent = await this.whatsappService.sendMessage(clinicId, phone, message);
      if (sent) {
        this.logger.log(`Dentist ${dentistName} notified via WhatsApp (${details.type})`);
      } else {
        this.logger.warn(`Failed to notify dentist ${dentistName} via WhatsApp`);
      }
    } catch (error: any) {
      this.logger.error(`Error notifying dentist: ${error.message}`);
    }
  }

  // ============================================
  // AI SETTINGS
  // ============================================

  private async getClinicAiSettings(clinicId: string): Promise<AiSettings> {
    const cacheKey = `clinic:ai-settings:${clinicId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const settings = await this.prisma.clinicAiSettings.findUnique({
          where: { clinic_id: clinicId },
        });

        // Busca lat/lng da clínica para envio de localização
        const clinic = await this.prisma.clinic.findUnique({
          where: { id: clinicId },
          select: { latitude: true, longitude: true },
        });

        return {
          ai_provider: settings?.ai_provider || 'anthropic',
          ai_api_key: settings?.ai_api_key || null,
          ai_model: settings?.ai_model || 'claude-3-5-haiku-20241022',
          ai_temperature: settings?.ai_temperature ? Number(settings.ai_temperature) : 0.7,
          max_tokens: settings?.max_tokens || 800,
          assistant_name: settings?.assistant_name || 'Sofia',
          assistant_personality:
            settings?.assistant_personality || 'Amigável, profissional e prestativa',
          welcome_message: settings?.welcome_message || null,
          fallback_message: settings?.fallback_message || null,
          custom_instructions: settings?.custom_instructions || null,
          context_messages: settings?.context_messages || 10,
          blocked_topics: settings?.blocked_topics || [],
          transfer_keywords: settings?.transfer_keywords || [],
          auto_schedule: settings?.auto_schedule ?? false,
          auto_confirm: settings?.auto_confirm ?? false,
          auto_cancel: settings?.auto_cancel ?? false,
          // Interactive messages
          use_welcome_menu: settings?.use_welcome_menu ?? false,
          use_confirmation_buttons: settings?.use_confirmation_buttons ?? false,
          use_timeslot_list: settings?.use_timeslot_list ?? false,
          use_satisfaction_poll: settings?.use_satisfaction_poll ?? false,
          use_send_location: settings?.use_send_location ?? false,
          clinic_latitude: clinic?.latitude || undefined,
          clinic_longitude: clinic?.longitude || undefined,
          // Dentist AI
          dentist_ai_enabled: settings?.dentist_ai_enabled ?? false,
        };
      },
      FIVE_MINUTES,
    );
  }

  // ============================================
  // SYSTEM PROMPT
  // ============================================

  private buildSystemPrompt(context: PatientContext, settings: AiSettings): string {
    return buildDentalAssistantPrompt(context, settings);
  }

  // ============================================
  // FALLBACK (quando API não está disponível)
  // ============================================

  private getFallbackResponse(
    message: string,
    context: PatientContext,
    settings: AiSettings,
  ): string {
    const name = settings.assistant_name || 'Sofia';
    const lowerMessage = message.toLowerCase();

    if (settings.fallback_message) {
      return settings.fallback_message;
    }

    if (this.isGreeting(lowerMessage)) {
      if (settings.welcome_message) {
        return settings.welcome_message.replace('{patientName}', context.patientName);
      }
      return `Olá ${context.patientName}! 😊 Sou a ${name}, assistente virtual da ${context.clinicName}. Como posso ajudar você hoje?

Posso auxiliar com:
• Agendamento de consultas
• Informações sobre serviços e preços
• Confirmação ou remarcação de consultas

O que você precisa?`;
    }

    if (this.wantsToSchedule(lowerMessage)) {
      let response = `Claro, ${context.patientName}! Vou te ajudar a agendar. 📅\n\n`;
      if (context.services.length > 0) {
        response += `Nossos serviços:\n`;
        context.services.slice(0, 5).forEach((s) => {
          response += `• ${s.name} - R$ ${s.price.toFixed(2)}\n`;
        });
        response += `\nQual procedimento você precisa?`;
      } else {
        response += `Qual procedimento você gostaria de agendar?`;
      }
      return response;
    }

    if (this.wantsPrices(lowerMessage)) {
      if (context.services.length > 0) {
        let response = `Aqui estão nossos serviços e valores: 💰\n\n`;
        context.services.forEach((s) => {
          response += `• ${s.name}: R$ ${s.price.toFixed(2)} (${s.duration} min)\n`;
        });
        response += `\nGostaria de agendar algum desses serviços?`;
        return response;
      }
      return `Para informações sobre preços, por favor entre em contato com nossa recepção. Posso ajudar com mais alguma coisa?`;
    }

    return `Olá ${context.patientName}! 😊 Sou a ${name}, assistente da ${context.clinicName}.

Como posso ajudar?
• Digite "agendar" para marcar uma consulta
• Digite "preços" para ver nossos serviços
• Digite "confirmar" para confirmar sua consulta

Ou me conte o que você precisa!`;
  }

  private isGreeting(message: string): boolean {
    const greetings = [
      'oi',
      'olá',
      'ola',
      'bom dia',
      'boa tarde',
      'boa noite',
      'hey',
      'hello',
      'eae',
      'e aí',
    ];
    return greetings.some((g) => message.includes(g));
  }

  private wantsToSchedule(message: string): boolean {
    const keywords = [
      'agendar',
      'marcar',
      'consulta',
      'horário',
      'horario',
      'disponível',
      'disponivel',
      'vaga',
    ];
    return keywords.some((k) => message.includes(k));
  }

  private wantsPrices(message: string): boolean {
    const keywords = ['preço', 'preco', 'valor', 'quanto custa', 'tabela', 'valores', 'custo'];
    return keywords.some((k) => message.includes(k));
  }
}
