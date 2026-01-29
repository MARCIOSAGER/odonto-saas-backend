import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  // Clínica
  clinicName: string;
  clinicPhone?: string;
  businessHours?: string;

  // Paciente
  patientName: string;
  patientPhone: string;

  // Histórico do paciente
  patientHistory: {
    totalAppointments: number;
    upcomingAppointments: AppointmentInfo[];
    lastAppointment: { date: string; service: string } | null;
  };

  // Serviços disponíveis
  services: ServiceInfo[];

  // Horários disponíveis (próximos 3 dias)
  availableSlots: {
    date: string;
    slots: string[];
  }[];

  // Histórico da conversa
  conversationHistory: ConversationMessage[];

  // Dentistas disponíveis
  dentists: {
    name: string;
    specialty?: string;
  }[];
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.anthropic.com/v1/messages';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get('ANTHROPIC_API_KEY', '');
  }

  async processMessage(userMessage: string, context: PatientContext): Promise<string | null> {
    if (!this.apiKey) {
      this.logger.warn('Anthropic API key not configured');
      return this.getFallbackResponse(userMessage, context);
    }

    try {
      const systemPrompt = this.buildSystemPrompt(context);

      // Monta histórico + nova mensagem
      const messages: ClaudeMessage[] = [
        ...context.conversationHistory.slice(-10).map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user' as const, content: userMessage },
      ];

      this.logger.debug(`Sending to Claude with ${messages.length} messages`);

      const response = await axios.post(
        this.apiUrl,
        {
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 800,
          system: systemPrompt,
          messages,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 30000,
        },
      );

      const aiResponse = response.data.content[0]?.text;

      if (!aiResponse) {
        this.logger.warn('Empty response from Claude');
        return this.getFallbackResponse(userMessage, context);
      }

      return aiResponse;
    } catch (error: any) {
      this.logger.error(`Claude API error: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response: ${JSON.stringify(error.response.data)}`);
      }
      return this.getFallbackResponse(userMessage, context);
    }
  }

  private buildSystemPrompt(context: PatientContext): string {
    const now = new Date();
    const today = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let prompt = `Você é uma assistente virtual da ${context.clinicName}, uma clínica odontológica.
Seu nome é Sofia e você é especialista em atendimento ao paciente.

## DATA E HORA ATUAL
Hoje é ${today}, ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.

## SUAS RESPONSABILIDADES
- Agendar consultas verificando disponibilidade
- Informar preços dos serviços
- Confirmar, remarcar ou cancelar consultas
- Responder dúvidas sobre procedimentos
- Enviar lembretes e orientações

## REGRAS IMPORTANTES
1. Seja educada, profissional e acolhedora
2. Use linguagem clara e acessível
3. SEMPRE verifique os horários disponíveis antes de sugerir agendamento
4. Para emergências, oriente a ligar: ${context.clinicPhone || 'para a clínica'}
5. Mantenha respostas concisas (máximo 3 parágrafos)
6. NUNCA forneça diagnósticos ou prescrições médicas
7. Use emojis com moderação para ser amigável 😊
8. Se não souber algo, ofereça transferir para atendente humano

## INFORMAÇÕES DA CLÍNICA
- Nome: ${context.clinicName}
${context.clinicPhone ? `- Telefone: ${context.clinicPhone}` : ''}
${context.businessHours ? `- Horário de funcionamento: ${context.businessHours}` : '- Horário: Segunda a Sexta 8h-18h, Sábado 8h-12h'}

## PACIENTE ATUAL
- Nome: ${context.patientName}
- Telefone: ${context.patientPhone}
- Total de consultas anteriores: ${context.patientHistory.totalAppointments}`;

    // Próximas consultas do paciente
    if (context.patientHistory.upcomingAppointments.length > 0) {
      prompt += `\n\n## CONSULTAS AGENDADAS DO PACIENTE`;
      context.patientHistory.upcomingAppointments.forEach((apt) => {
        prompt += `\n- ${apt.date} às ${apt.time} - ${apt.service}${apt.dentist ? ` com ${apt.dentist}` : ''} (${apt.status})`;
      });
    } else {
      prompt += `\n\n## CONSULTAS AGENDADAS DO PACIENTE\nNenhuma consulta agendada.`;
    }

    // Última consulta
    if (context.patientHistory.lastAppointment) {
      prompt += `\n\n## ÚLTIMA CONSULTA\n${context.patientHistory.lastAppointment.date} - ${context.patientHistory.lastAppointment.service}`;
    }

    // Serviços e preços
    if (context.services.length > 0) {
      prompt += `\n\n## SERVIÇOS E PREÇOS`;
      context.services.forEach((service) => {
        prompt += `\n- ${service.name}: R$ ${service.price.toFixed(2)} (duração: ${service.duration} min)`;
      });
    }

    // Dentistas
    if (context.dentists.length > 0) {
      prompt += `\n\n## DENTISTAS DISPONÍVEIS`;
      context.dentists.forEach((dentist) => {
        prompt += `\n- ${dentist.name}${dentist.specialty ? ` - ${dentist.specialty}` : ''}`;
      });
    }

    // Horários disponíveis
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

  private getFallbackResponse(message: string, context: PatientContext): string {
    const lowerMessage = message.toLowerCase();

    // Saudações
    if (this.isGreeting(lowerMessage)) {
      return `Olá ${context.patientName}! 😊 Sou a Sofia, assistente virtual da ${context.clinicName}. Como posso ajudar você hoje?

Posso auxiliar com:
• Agendamento de consultas
• Informações sobre serviços e preços
• Confirmação ou remarcação de consultas

O que você precisa?`;
    }

    // Agendamento
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

    // Preços
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

    // Confirmar consulta
    if (this.wantsToConfirm(lowerMessage)) {
      if (context.patientHistory.upcomingAppointments.length > 0) {
        const next = context.patientHistory.upcomingAppointments[0];
        return `${context.patientName}, você tem uma consulta agendada para:\n\n📅 ${next.date} às ${next.time}\n🦷 ${next.service}\n\nPosso confirmar sua presença? (responda SIM ou NÃO)`;
      }
      return `Não encontrei consultas agendadas para você, ${context.patientName}. Gostaria de agendar uma?`;
    }

    // Cancelar/Remarcar
    if (this.wantsToCancel(lowerMessage) || this.wantsToReschedule(lowerMessage)) {
      if (context.patientHistory.upcomingAppointments.length > 0) {
        const next = context.patientHistory.upcomingAppointments[0];
        return `Entendi, ${context.patientName}. Você tem uma consulta em ${next.date} às ${next.time}.\n\nPara ${this.wantsToCancel(lowerMessage) ? 'cancelar' : 'remarcar'}, por favor entre em contato com nossa recepção pelo telefone ${context.clinicPhone || 'da clínica'}. Assim garantimos o melhor atendimento!`;
      }
      return `Não encontrei consultas agendadas para você. Posso ajudar com algo mais?`;
    }

    // Horários
    if (this.wantsHours(lowerMessage)) {
      return `A ${context.clinicName} funciona:\n\n📍 Segunda a Sexta: 8h às 18h\n📍 Sábado: 8h às 12h\n\n${context.clinicPhone ? `📞 Telefone: ${context.clinicPhone}` : ''}\n\nPosso ajudar com mais alguma coisa?`;
    }

    // Resposta padrão
    return `Olá ${context.patientName}! 😊 Sou a Sofia, assistente da ${context.clinicName}.

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

  private wantsToConfirm(message: string): boolean {
    const keywords = ['confirmar', 'confirmação', 'confirmacao', 'confirmo'];
    return keywords.some((k) => message.includes(k));
  }

  private wantsToCancel(message: string): boolean {
    const keywords = ['cancelar', 'desmarcar', 'cancelamento'];
    return keywords.some((k) => message.includes(k));
  }

  private wantsToReschedule(message: string): boolean {
    const keywords = ['remarcar', 'reagendar', 'mudar', 'alterar data', 'trocar'];
    return keywords.some((k) => message.includes(k));
  }

  private wantsHours(message: string): boolean {
    const keywords = [
      'horário de funcionamento',
      'horario de funcionamento',
      'que horas abre',
      'que horas fecha',
      'funcionamento',
      'aberto',
    ];
    return keywords.some((k) => message.includes(k));
  }
}
