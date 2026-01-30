import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

interface ServiceInfo {
  name: string;
  price: number;
  duration: number;
}

interface AppointmentInfo {
  date: string;
  time: string;
  service: string;
  dentist?: string;
  status: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface PatientContext {
  clinicName: string;
  clinicPhone?: string;
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
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly defaultApiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.defaultApiKey = this.configService.get('ANTHROPIC_API_KEY', '');
  }

  async processMessage(
    clinicId: string,
    userMessage: string,
    context: PatientContext,
  ): Promise<string | null> {
    // Buscar configurações de IA da clínica
    const settings = await this.getClinicAiSettings(clinicId);

    const provider = settings.ai_provider;
    const apiKey = settings.ai_api_key || (provider === 'anthropic' ? this.defaultApiKey : '');

    if (!apiKey) {
      this.logger.warn(`No API key for provider ${provider} in clinic ${clinicId}`);
      return this.getFallbackResponse(userMessage, context, settings);
    }

    try {
      const systemPrompt = this.buildSystemPrompt(context, settings);
      const messages = [
        ...context.conversationHistory.slice(-(settings.context_messages || 10)).map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user' as const, content: userMessage },
      ];

      this.logger.debug(`Sending to ${provider} (${settings.ai_model}) with ${messages.length} messages`);

      if (provider === 'anthropic') {
        return await this.callAnthropic(apiKey, settings, systemPrompt, messages);
      }

      if (provider === 'openai') {
        return await this.callOpenAI(apiKey, settings, systemPrompt, messages);
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

  private async getClinicAiSettings(clinicId: string): Promise<AiSettings> {
    const settings = await this.prisma.clinicAiSettings.findUnique({
      where: { clinic_id: clinicId },
    });

    return {
      ai_provider: settings?.ai_provider || 'anthropic',
      ai_api_key: settings?.ai_api_key || null,
      ai_model: settings?.ai_model || 'claude-3-5-haiku-20241022',
      ai_temperature: settings?.ai_temperature ? Number(settings.ai_temperature) : 0.7,
      max_tokens: settings?.max_tokens || 800,
      assistant_name: settings?.assistant_name || 'Sofia',
      assistant_personality: settings?.assistant_personality || 'Amigável, profissional e prestativa',
      welcome_message: settings?.welcome_message || null,
      fallback_message: settings?.fallback_message || null,
      custom_instructions: settings?.custom_instructions || null,
      context_messages: settings?.context_messages || 10,
      blocked_topics: settings?.blocked_topics || [],
      transfer_keywords: settings?.transfer_keywords || [],
    };
  }

  private async callAnthropic(
    apiKey: string,
    settings: AiSettings,
    systemPrompt: string,
    messages: { role: string; content: string }[],
  ): Promise<string | null> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: settings.ai_model,
        max_tokens: settings.max_tokens,
        temperature: settings.ai_temperature,
        system: systemPrompt,
        messages,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 30000,
      },
    );

    return response.data?.content?.[0]?.text || null;
  }

  private async callOpenAI(
    apiKey: string,
    settings: AiSettings,
    systemPrompt: string,
    messages: { role: string; content: string }[],
  ): Promise<string | null> {
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: settings.ai_model,
        max_tokens: settings.max_tokens,
        temperature: settings.ai_temperature,
        messages: openaiMessages,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 30000,
      },
    );

    return response.data?.choices?.[0]?.message?.content || null;
  }

  private async callGoogle(
    apiKey: string,
    settings: AiSettings,
    systemPrompt: string,
    messages: { role: string; content: string }[],
  ): Promise<string | null> {
    // Converter formato para Gemini
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

  private buildSystemPrompt(context: PatientContext, settings: AiSettings): string {
    const now = new Date();
    const today = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const name = settings.assistant_name || 'Sofia';
    const personality = settings.assistant_personality || 'educada, profissional e acolhedora';

    let prompt = `Você é uma assistente virtual da ${context.clinicName}, uma clínica odontológica.
Seu nome é ${name} e sua personalidade é: ${personality}.

## DATA E HORA ATUAL
Hoje é ${today}, ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.

## SUAS RESPONSABILIDADES
- Agendar consultas verificando disponibilidade
- Informar preços dos serviços
- Confirmar, remarcar ou cancelar consultas
- Responder dúvidas sobre procedimentos
- Enviar lembretes e orientações

## REGRAS IMPORTANTES
1. Seja ${personality}
2. Use linguagem clara e acessível
3. SEMPRE verifique os horários disponíveis antes de sugerir agendamento
4. Para emergências, oriente a ligar: ${context.clinicPhone || 'para a clínica'}
5. Mantenha respostas concisas (máximo 3 parágrafos)
6. NUNCA forneça diagnósticos ou prescrições médicas
7. Use emojis com moderação para ser amigável 😊
8. Se não souber algo, ofereça transferir para atendente humano`;

    // Tópicos bloqueados
    if (settings.blocked_topics.length > 0) {
      prompt += `\n9. NUNCA fale sobre: ${settings.blocked_topics.join(', ')}`;
    }

    // Palavras de transferência
    if (settings.transfer_keywords.length > 0) {
      prompt += `\n10. Se o paciente mencionar: ${settings.transfer_keywords.join(', ')} → transfira para atendente humano`;
    }

    prompt += `

## INFORMAÇÕES DA CLÍNICA
- Nome: ${context.clinicName}
${context.clinicPhone ? `- Telefone: ${context.clinicPhone}` : ''}
${context.businessHours ? `- Horário de funcionamento: ${context.businessHours}` : '- Horário: Segunda a Sexta 8h-18h, Sábado 8h-12h'}

## PACIENTE ATUAL
- Nome: ${context.patientName}
- Telefone: ${context.patientPhone}
- Total de consultas anteriores: ${context.patientHistory.totalAppointments}`;

    if (context.patientHistory.upcomingAppointments.length > 0) {
      prompt += `\n\n## CONSULTAS AGENDADAS DO PACIENTE`;
      context.patientHistory.upcomingAppointments.forEach((apt) => {
        prompt += `\n- ${apt.date} às ${apt.time} - ${apt.service}${apt.dentist ? ` com ${apt.dentist}` : ''} (${apt.status})`;
      });
    } else {
      prompt += `\n\n## CONSULTAS AGENDADAS DO PACIENTE\nNenhuma consulta agendada.`;
    }

    if (context.patientHistory.lastAppointment) {
      prompt += `\n\n## ÚLTIMA CONSULTA\n${context.patientHistory.lastAppointment.date} - ${context.patientHistory.lastAppointment.service}`;
    }

    if (context.services.length > 0) {
      prompt += `\n\n## SERVIÇOS E PREÇOS`;
      context.services.forEach((service) => {
        prompt += `\n- ${service.name}: R$ ${service.price.toFixed(2)} (duração: ${service.duration} min)`;
      });
    }

    if (context.dentists.length > 0) {
      prompt += `\n\n## DENTISTAS DISPONÍVEIS`;
      context.dentists.forEach((dentist) => {
        prompt += `\n- ${dentist.name}${dentist.specialty ? ` - ${dentist.specialty}` : ''}`;
      });
    }

    if (context.availableSlots.length > 0) {
      prompt += `\n\n## HORÁRIOS DISPONÍVEIS (próximos dias)`;
      context.availableSlots.forEach((day) => {
        if (day.slots.length > 0) {
          prompt += `\n- ${day.date}: ${day.slots.join(', ')}`;
        } else {
          prompt += `\n- ${day.date}: Sem horários disponíveis`;
        }
      });
    }

    // Instruções customizadas da clínica
    if (settings.custom_instructions) {
      prompt += `\n\n## INSTRUÇÕES ESPECÍFICAS DA CLÍNICA\n${settings.custom_instructions}`;
    }

    prompt += `\n\n## INSTRUÇÕES PARA AGENDAMENTO
Quando o paciente quiser agendar:
1. Pergunte qual serviço deseja
2. Mostre os horários disponíveis
3. Confirme data, horário e serviço
4. Informe que a consulta será confirmada

## FORMATO DE RESPOSTA
- Seja direta e objetiva
- Use listas quando apropriado
- Sempre termine oferecendo mais ajuda`;

    return prompt;
  }

  private getFallbackResponse(message: string, context: PatientContext, settings: AiSettings): string {
    const name = settings.assistant_name || 'Sofia';
    const lowerMessage = message.toLowerCase();

    if (settings.fallback_message) {
      return settings.fallback_message;
    }

    // Saudações
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
    const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'eae', 'e aí'];
    return greetings.some((g) => message.includes(g));
  }

  private wantsToSchedule(message: string): boolean {
    const keywords = ['agendar', 'marcar', 'consulta', 'horário', 'horario', 'disponível', 'disponivel', 'vaga'];
    return keywords.some((k) => message.includes(k));
  }

  private wantsPrices(message: string): boolean {
    const keywords = ['preço', 'preco', 'valor', 'quanto custa', 'tabela', 'valores', 'custo'];
    return keywords.some((k) => message.includes(k));
  }
}
