import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface PatientContext {
  clinicName: string;
  patientName: string;
  patientHistory: {
    totalAppointments: number;
    upcomingAppointments: Array<{
      date: string;
      time: string;
      service: string;
      status: string;
    }>;
    lastAppointment: { date: string; service: string } | null;
  };
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
      const messages: ClaudeMessage[] = [{ role: 'user', content: userMessage }];

      const response = await axios.post(
        this.apiUrl,
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          system: systemPrompt,
          messages,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
        },
      );

      const aiResponse = response.data.content[0]?.text;
      return aiResponse || this.getFallbackResponse(userMessage, context);
    } catch (error) {
      this.logger.error(`Claude API error: ${error}`);
      return this.getFallbackResponse(userMessage, context);
    }
  }

  private buildSystemPrompt(context: PatientContext): string {
    let prompt = `Você é uma assistente virtual da ${context.clinicName}, uma clínica odontológica.
Seu nome é Sofia e você ajuda pacientes com:
- Agendamento de consultas
- Informações sobre serviços
- Confirmação e remarcação de consultas
- Dúvidas gerais sobre procedimentos

Regras importantes:
1. Seja sempre educada e profissional
2. Use linguagem clara e acessível
3. Para agendar consultas, peça: data preferida, horário e tipo de serviço
4. Para emergências, oriente a ligar diretamente para a clínica
5. Mantenha respostas concisas (máximo 3 parágrafos)
6. Não forneça diagnósticos ou prescrições
7. Use emojis com moderação para ser amigável

Informações do paciente:
- Nome: ${context.patientName}
- Total de consultas: ${context.patientHistory.totalAppointments}`;

    if (context.patientHistory.upcomingAppointments.length > 0) {
      prompt += `\n- Próximas consultas agendadas:`;
      context.patientHistory.upcomingAppointments.forEach((apt) => {
        prompt += `\n  * ${apt.date} às ${apt.time} - ${apt.service} (${apt.status})`;
      });
    }

    if (context.patientHistory.lastAppointment) {
      prompt += `\n- Última consulta: ${context.patientHistory.lastAppointment.date} - ${context.patientHistory.lastAppointment.service}`;
    }

    return prompt;
  }

  private getFallbackResponse(message: string, context: PatientContext): string {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('agendar') ||
      lowerMessage.includes('marcar') ||
      lowerMessage.includes('consulta')
    ) {
      return `Olá ${context.patientName}! Para agendar sua consulta na ${context.clinicName}, por favor me informe:
1. Qual procedimento você precisa?
2. Qual sua preferência de data e horário?

Nossa equipe entrará em contato para confirmar a disponibilidade.`;
    }

    if (lowerMessage.includes('confirmar') || lowerMessage.includes('confirmação')) {
      if (context.patientHistory.upcomingAppointments.length > 0) {
        const next = context.patientHistory.upcomingAppointments[0];
        return `Olá ${context.patientName}! Você tem uma consulta agendada para ${next.date} às ${next.time} (${next.service}). Posso confirmar sua presença?`;
      }
      return `Olá ${context.patientName}! Não encontrei consultas agendadas para você. Gostaria de agendar uma nova consulta?`;
    }

    if (
      lowerMessage.includes('cancelar') ||
      lowerMessage.includes('remarcar') ||
      lowerMessage.includes('desmarcar')
    ) {
      return `Entendo que precisa alterar sua consulta. Por favor, entre em contato diretamente com nossa recepção para realizar o cancelamento ou remarcação. Assim garantimos o melhor atendimento!`;
    }

    if (lowerMessage.includes('horário') || lowerMessage.includes('funcionamento')) {
      return `A ${context.clinicName} funciona de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h. Posso ajudar com algo mais?`;
    }

    return `Olá ${context.patientName}! Sou a Sofia, assistente virtual da ${context.clinicName}. Como posso ajudar você hoje?

Posso auxiliar com:
- Agendamento de consultas
- Informações sobre nossos serviços
- Confirmação de consultas`;
  }
}
