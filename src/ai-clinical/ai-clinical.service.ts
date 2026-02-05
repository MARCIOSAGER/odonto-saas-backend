import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

interface AiClinicSettings {
  ai_provider: string;
  ai_api_key: string | null;
  ai_model: string;
  ai_temperature: number;
  max_tokens: number;
}

@Injectable()
export class AiClinicalService {
  private readonly logger = new Logger(AiClinicalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Gera prontuário clínico estruturado a partir de texto livre.
   */
  async generateClinicalNotes(
    clinicId: string,
    input: {
      freeText: string;
      patientId?: string;
      appointmentId?: string;
    },
  ) {
    const settings = await this.getAiSettings(clinicId);
    let patientContext = '';

    if (input.patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: input.patientId },
        select: { name: true, birth_date: true, notes: true },
      });
      if (patient) {
        const age = patient.birth_date
          ? Math.floor(
              (Date.now() - new Date(patient.birth_date).getTime()) /
                (365.25 * 24 * 60 * 60 * 1000),
            )
          : null;
        patientContext = `\nPaciente: ${patient.name}${age ? `, ${age} anos` : ''}${patient.notes ? `\nObservações: ${patient.notes}` : ''}`;
      }
    }

    const systemPrompt = `Você é um assistente clínico odontológico. Sua tarefa é transformar anotações informais em prontuário clínico estruturado.

Regras:
- Mantenha termos técnicos odontológicos corretos
- Estruture em seções: Queixa Principal, Exame Clínico, Diagnóstico, Procedimento Realizado, Prescrição (se houver), Orientações, Retorno
- Se alguma seção não tiver informação no texto, omita-a
- Mantenha tom profissional e objetivo
- Use notação FDI para dentes (ex: dente 36)
- Responda APENAS em JSON com o formato:
{
  "complaint": "queixa principal",
  "examination": "exame clínico",
  "diagnosis": "diagnóstico",
  "procedure": "procedimento realizado",
  "prescription": "prescrição se houver ou null",
  "instructions": "orientações ao paciente",
  "followUp": "retorno recomendado ou null",
  "summary": "resumo em uma frase"
}`;

    const userMessage = `${patientContext}\n\nTexto do profissional:\n${input.freeText}`;

    const response = await this.callAi(settings, systemPrompt, userMessage);
    return this.parseJsonResponse(response);
  }

  /**
   * Sugere plano de tratamento baseado no odontograma e histórico.
   */
  async suggestTreatmentPlan(clinicId: string, patientId: string) {
    const settings = await this.getAiSettings(clinicId);

    // Busca dados do paciente
    const [patient, odontogram, appointments, services] = await Promise.all([
      this.prisma.patient.findUnique({
        where: { id: patientId },
        select: { name: true, birth_date: true, notes: true },
      }),
      this.prisma.odontogram.findFirst({
        where: { patient_id: patientId, clinic_id: clinicId },
        orderBy: { updated_at: 'desc' },
        include: {
          entries: {
            where: {
              superseded_at: null,
              entry_type: 'FINDING',
              status_code: { not: 'HEALTHY' },
            },
            orderBy: { tooth_number: 'asc' },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: { patient_id: patientId },
        orderBy: { date: 'desc' },
        take: 10,
        include: { service: { select: { name: true, price: true } } },
      }),
      this.prisma.service.findMany({
        where: {
          clinic_id: clinicId,
          status: 'active',
        },
        select: { name: true, price: true, duration: true },
      }),
    ]);

    if (!patient) {
      return { error: 'Paciente não encontrado' };
    }

    const teethIssues =
      odontogram?.entries?.map((e) => ({
        tooth: e.tooth_number,
        status_code: e.status_code,
        entry_type: e.entry_type,
        surfaces: e.surfaces,
        notes: e.notes,
      })) || [];

    const recentProcedures = appointments
      .filter((a) => a.status === 'completed')
      .map((a) => ({
        date: a.date.toISOString().split('T')[0],
        service: a.service.name,
      }));

    const systemPrompt = `Você é um assistente odontológico especialista em planos de tratamento. Analise o odontograma e histórico do paciente para sugerir um plano de tratamento completo.

Regras:
- Priorize tratamentos urgentes (dor, infecção) primeiro
- Ordene por prioridade: urgente > importante > estético
- Inclua estimativa de custo baseada nos serviços disponíveis
- Considere procedimentos já realizados
- Responda em JSON:
{
  "patientSummary": "breve resumo da situação do paciente",
  "phases": [
    {
      "name": "Nome da fase",
      "priority": "urgente|importante|eletivo",
      "procedures": [
        {
          "tooth": 36,
          "procedure": "nome do procedimento",
          "reason": "motivo",
          "estimatedCost": 150.00,
          "sessions": 1
        }
      ],
      "totalCost": 150.00,
      "estimatedSessions": 1
    }
  ],
  "totalCost": 150.00,
  "totalSessions": 1,
  "recommendations": "recomendações gerais"
}`;

    const userMessage = `Paciente: ${patient.name}
${patient.birth_date ? `Idade: ${Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} anos` : ''}
${patient.notes ? `Observações: ${patient.notes}` : ''}

Odontograma - Dentes com problemas:
${teethIssues.length > 0 ? JSON.stringify(teethIssues, null, 2) : 'Nenhum problema registrado'}

Procedimentos recentes:
${recentProcedures.length > 0 ? JSON.stringify(recentProcedures, null, 2) : 'Nenhum'}

Serviços disponíveis com preços:
${JSON.stringify(services, null, 2)}`;

    const response = await this.callAi(settings, systemPrompt, userMessage);
    return this.parseJsonResponse(response);
  }

  /**
   * Gera resumo inteligente do paciente.
   */
  async getPatientSummary(clinicId: string, patientId: string) {
    const settings = await this.getAiSettings(clinicId);

    const [patient, appointments, odontogram] = await Promise.all([
      this.prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          name: true,
          phone: true,
          email: true,
          birth_date: true,
          notes: true,
          status: true,
          last_visit: true,
          created_at: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: { patient_id: patientId },
        orderBy: { date: 'desc' },
        take: 20,
        include: {
          service: { select: { name: true, price: true } },
          dentist: { select: { name: true } },
        },
      }),
      this.prisma.odontogram.findFirst({
        where: { patient_id: patientId },
        orderBy: { updated_at: 'desc' },
        include: {
          entries: {
            where: {
              superseded_at: null,
              entry_type: 'FINDING',
              status_code: { not: 'HEALTHY' },
            },
          },
        },
      }),
    ]);

    if (!patient) {
      return { error: 'Paciente não encontrado' };
    }

    const completedCount = appointments.filter((a) => a.status === 'completed').length;
    const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;
    const noShowCount = appointments.filter((a) => a.status === 'no_show').length;
    const totalSpent = appointments
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + Number(a.service.price), 0);

    const systemPrompt = `Você é um assistente odontológico. Gere um resumo executivo do paciente para o dentista. Seja conciso e objetivo.

Responda em JSON:
{
  "overview": "resumo geral em 2-3 frases",
  "riskFactors": ["lista de fatores de risco ou atenção"],
  "oralHealthScore": "bom|regular|precisa atenção|crítico",
  "adherence": "excelente|boa|regular|baixa",
  "financialSummary": "resumo financeiro breve",
  "recommendations": ["próximos passos recomendados"],
  "alerts": ["alertas importantes, se houver"]
}`;

    const userMessage = `Paciente: ${patient.name}
${patient.birth_date ? `Idade: ${Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} anos` : ''}
Cliente desde: ${patient.created_at.toISOString().split('T')[0]}
Última visita: ${patient.last_visit ? patient.last_visit.toISOString().split('T')[0] : 'Nunca'}
Observações: ${patient.notes || 'Nenhuma'}

Consultas: ${completedCount} realizadas, ${cancelledCount} canceladas, ${noShowCount} faltas
Total investido: R$ ${totalSpent.toFixed(2)}

Histórico recente:
${appointments
  .slice(0, 10)
  .map(
    (a) =>
      `- ${a.date.toISOString().split('T')[0]} ${a.time}: ${a.service.name} (${a.status})${a.dentist ? ` - Dr(a). ${a.dentist.name}` : ''}`,
  )
  .join('\n')}

Problemas odontológicos atuais:
${odontogram?.entries.length ? odontogram.entries.map((e) => `- Dente ${e.tooth_number}: ${e.status_code} [${e.surfaces.join(',')}]${e.notes ? ` (${e.notes})` : ''}`).join('\n') : 'Nenhum registrado'}`;

    const response = await this.callAi(settings, systemPrompt, userMessage);
    return this.parseJsonResponse(response);
  }

  /**
   * Anamnese assistida por IA.
   */
  async processAnamnesis(
    clinicId: string,
    input: {
      patientId?: string;
      answers: Record<string, string>;
    },
  ) {
    const settings = await this.getAiSettings(clinicId);

    const systemPrompt = `Você é um assistente odontológico especialista em anamnese. Analise as respostas do questionário e gere um relatório estruturado.

Regras:
- Identifique condições de risco
- Destaque alergias e medicamentos com potencial interação
- Classifique o risco do paciente (ASA I a IV)
- Identifique contraindicações para procedimentos comuns

Responda em JSON:
{
  "riskClassification": "ASA I|II|III|IV",
  "allergies": ["lista de alergias encontradas"],
  "medications": ["medicamentos em uso"],
  "conditions": ["condições médicas relevantes"],
  "contraindications": ["contraindicações para procedimentos"],
  "alerts": ["alertas críticos - vermelho"],
  "warnings": ["avisos importantes - amarelo"],
  "notes": "observações adicionais",
  "recommendations": "recomendações para o profissional"
}`;

    const answersText = Object.entries(input.answers)
      .map(([question, answer]) => `${question}: ${answer}`)
      .join('\n');

    const response = await this.callAi(
      settings,
      systemPrompt,
      `Respostas da anamnese:\n${answersText}`,
    );
    return this.parseJsonResponse(response);
  }

  // === Helpers ===

  private async getAiSettings(clinicId: string): Promise<AiClinicSettings> {
    const settings = await this.prisma.clinicAiSettings.findUnique({
      where: { clinic_id: clinicId },
    });

    if (!settings) {
      // Fallback para configuração global
      return {
        ai_provider: 'anthropic',
        ai_api_key: this.configService.get('ANTHROPIC_API_KEY') || null,
        ai_model: 'claude-3-5-haiku-20241022',
        ai_temperature: 0.3,
        max_tokens: 2000,
      };
    }

    return {
      ai_provider: settings.ai_provider,
      ai_api_key: settings.ai_api_key || this.configService.get('ANTHROPIC_API_KEY') || null,
      ai_model: settings.ai_model,
      ai_temperature: Number(settings.ai_temperature),
      max_tokens: Math.max(settings.max_tokens, 2000),
    };
  }

  private async callAi(
    settings: AiClinicSettings,
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const { ai_provider, ai_api_key, ai_model, ai_temperature, max_tokens } = settings;

    if (!ai_api_key) {
      throw new Error('API key não configurada. Configure nas configurações de IA.');
    }

    try {
      if (ai_provider === 'anthropic') {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: ai_model,
            max_tokens,
            temperature: ai_temperature,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
          },
          {
            headers: {
              'x-api-key': ai_api_key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            timeout: 60000,
          },
        );
        return response.data.content[0]?.text || '';
      }

      if (ai_provider === 'openai') {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: ai_model,
            max_tokens,
            temperature: ai_temperature,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${ai_api_key}`,
              'content-type': 'application/json',
            },
            timeout: 60000,
          },
        );
        return response.data.choices[0]?.message?.content || '';
      }

      if (ai_provider === 'google') {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${ai_model}:generateContent?key=${ai_api_key}`,
          {
            contents: [
              {
                parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
              },
            ],
            generationConfig: {
              temperature: ai_temperature,
              maxOutputTokens: max_tokens,
            },
          },
          { timeout: 60000 },
        );
        return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      throw new Error(`Provedor de IA não suportado: ${ai_provider}`);
    } catch (error: any) {
      this.logger.error(`AI API error: ${error.message}`);
      if (error.response?.data) {
        this.logger.error(`AI API response: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error('Erro ao processar com IA. Tente novamente.');
    }
  }

  private parseJsonResponse(text: string): Record<string, unknown> {
    try {
      // Tenta extrair JSON do texto (pode vir com markdown ```json ... ```)
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
      return JSON.parse(jsonStr);
    } catch {
      // Se não conseguir parsear, retorna o texto como string
      return { raw: text };
    }
  }
}
