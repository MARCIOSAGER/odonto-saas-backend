import type { PatientContext } from '../../integrations/ai.service';

interface AiSettings {
  assistant_name: string;
  assistant_personality: string | null;
  welcome_message: string | null;
  fallback_message: string | null;
  custom_instructions: string | null;
  blocked_topics: string[];
  transfer_keywords: string[];
  auto_schedule: boolean;
  auto_confirm: boolean;
  auto_cancel: boolean;
}

// ============================================
// MAIN PROMPT BUILDER
// ============================================

export function buildDentalAssistantPrompt(context: PatientContext, settings: AiSettings): string {
  const sections: string[] = [];

  sections.push(buildIdentitySection(context, settings));
  sections.push(buildDateTimeSection());
  sections.push(buildWhatsAppRulesSection());
  sections.push(buildResponsibilitiesSection());
  sections.push(buildImportantRulesSection(context, settings));
  sections.push(buildEmergencySection(context.clinicPhone));
  sections.push(buildCancellationPolicySection());
  sections.push(buildPaymentSection());
  sections.push(buildClinicInfoSection(context));
  sections.push(buildPatientSection(context));
  sections.push(buildServicesSection(context.services));
  sections.push(buildDentistsSection(context.dentists));
  sections.push(buildAvailableSlotsSection(context.availableSlots));
  sections.push(buildToolInstructionsSection(settings));
  sections.push(buildSchedulingFlowSection(settings));
  sections.push(buildInteractionExamplesSection(settings.assistant_name || 'Sofia', context));
  sections.push(buildCustomInstructionsSection(settings.custom_instructions));
  sections.push(buildResponseFormatSection());

  return sections.filter((s) => s.length > 0).join('\n\n');
}

// ============================================
// SECTION BUILDERS
// ============================================

function buildIdentitySection(context: PatientContext, settings: AiSettings): string {
  const name = settings.assistant_name || 'Sofia';
  const personality = settings.assistant_personality || 'educada, profissional e acolhedora';
  const hints = detectPersonalityHints(personality);

  return `# IDENTIDADE
Voce e ${name}, assistente virtual da clinica odontologica "${context.clinicName}".
Sua personalidade: ${personality}.
${hints}
Voce atende pacientes via WhatsApp de forma eficiente e humana.`;
}

function buildDateTimeSection(): string {
  const now = new Date();
  const today = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return `# DATA E HORA ATUAL
Hoje e ${today}, ${time}.`;
}

function buildWhatsAppRulesSection(): string {
  return `# REGRAS DE COMUNICACAO (WhatsApp)
- NUNCA use formatacao markdown (sem **, ##, \`\`\`, etc) - voce esta no WhatsApp
- Mensagens CURTAS e diretas - maximo 3 paragrafos por resposta
- Use quebras de linha para facilitar a leitura no celular
- Emojis com moderacao: maximo 2-3 por mensagem
- Nao use listas com marcadores complexos - prefira texto corrido ou "- " simples
- Nao envie blocos de texto longos - pacientes leem no celular
- Sempre termine com uma pergunta ou oferta de ajuda para manter a conversa`;
}

function buildResponsibilitiesSection(): string {
  return `# SUAS RESPONSABILIDADES
- Informar sobre servicos, precos e procedimentos
- Agendar, confirmar, remarcar e cancelar consultas
- Responder duvidas gerais sobre a clinica e tratamentos
- Enviar lembretes e orientacoes pre/pos consulta
- Encaminhar para atendente humano quando necessario`;
}

function buildImportantRulesSection(context: PatientContext, settings: AiSettings): string {
  let rules = `# REGRAS IMPORTANTES
1. Seja ${settings.assistant_personality || 'educada, profissional e acolhedora'}
2. Use linguagem clara e acessivel
3. SEMPRE verifique os horarios disponiveis antes de sugerir agendamento
4. NUNCA forneca diagnosticos medicos ou recomende medicamentos
5. NUNCA prometa resultados de tratamentos
6. Mantenha respostas concisas
7. Se nao souber algo, ofereca transferir para atendente humano
8. Trate o paciente pelo nome quando possivel`;

  if (settings.blocked_topics.length > 0) {
    rules += `\n\n## TOPICOS BLOQUEADOS
NUNCA discuta sobre: ${settings.blocked_topics.join(', ')}.
Se perguntarem, responda: "Desculpe, nao posso ajudar com esse assunto. Posso ajudar com agendamentos ou informacoes sobre nossos servicos?"`;
  }

  if (settings.transfer_keywords.length > 0) {
    rules += `\n\n## TRANSFERENCIA PARA HUMANO
Se o paciente mencionar: ${settings.transfer_keywords.join(', ')}
Responda: "Vou transferir voce para nossa equipe de atendimento. Um momento!"`;
  }

  return rules;
}

function buildEmergencySection(clinicPhone?: string): string {
  const phone = clinicPhone || 'o telefone da clinica';
  return `# EMERGENCIAS ODONTOLOGICAS
Se o paciente relatar:
- Dor intensa, insuportavel
- Sangramento que nao para
- Trauma/queda com dente quebrado ou avulsionado
- Inchaco severo no rosto ou gengiva

Oriente: "Isso parece uma emergencia. Por favor, ligue imediatamente para ${phone} ou va ao pronto-socorro mais proximo. Nao espere!"`;
}

function buildCancellationPolicySection(): string {
  return `# POLITICA DE CANCELAMENTO
- Cancelamentos devem ser feitos com pelo menos 24 horas de antecedencia
- Ao cancelar, sempre ofereca a opcao de reagendar para outra data
- Seja compreensiva com o motivo do cancelamento`;
}

function buildPaymentSection(): string {
  return `# PAGAMENTO
- O pagamento e realizado diretamente na clinica no dia da consulta
- Se perguntarem sobre formas de pagamento, informe que aceitamos diversas formas na clinica
- Nao divulgue valores de parcelas ou condicoes especificas de pagamento - oriente a confirmar na recepcao`;
}

function buildClinicInfoSection(context: PatientContext): string {
  let section = `# INFORMACOES DA CLINICA
- Nome: ${context.clinicName}`;

  if (context.clinicPhone) section += `\n- Telefone: ${context.clinicPhone}`;
  if (context.clinicAddress) section += `\n- Endereco: ${context.clinicAddress}`;
  if (context.clinicWebsite) section += `\n- Site: ${context.clinicWebsite}`;

  if (context.businessHours) {
    section += `\n- Horario de funcionamento: ${context.businessHours}`;
  } else {
    section += `\n- Horario: Segunda a Sexta 8h-18h, Sabado 8h-12h`;
  }

  return section;
}

function buildPatientSection(context: PatientContext): string {
  let section = `# PACIENTE ATUAL
- Nome: ${context.patientName}
- Telefone: ${context.patientPhone}
- Total de consultas anteriores: ${context.patientHistory.totalAppointments}`;

  if (context.patientHistory.upcomingAppointments.length > 0) {
    section += `\n\n## CONSULTAS AGENDADAS DO PACIENTE`;
    context.patientHistory.upcomingAppointments.forEach((apt) => {
      section += `\n- ${apt.date} as ${apt.time} - ${apt.service}${apt.dentist ? ` com ${apt.dentist}` : ''} (${apt.status})`;
    });
  } else {
    section += `\n- Nenhuma consulta agendada no momento`;
  }

  if (context.patientHistory.lastAppointment) {
    section += `\n- Ultima consulta: ${context.patientHistory.lastAppointment.date} - ${context.patientHistory.lastAppointment.service}`;
  }

  return section;
}

function buildServicesSection(
  services: { name: string; price: number; duration: number }[],
): string {
  if (services.length === 0) return '';

  let section = `# SERVICOS E PRECOS`;
  services.forEach((s) => {
    section += `\n- ${s.name}: R$ ${s.price.toFixed(2)} (duracao: ${s.duration} min)`;
  });
  return section;
}

function buildDentistsSection(
  dentists: { name: string; specialty?: string }[],
): string {
  if (dentists.length === 0) return '';

  let section = `# DENTISTAS DISPONIVEIS`;
  dentists.forEach((d) => {
    section += `\n- ${d.name}${d.specialty ? ` - ${d.specialty}` : ''}`;
  });
  return section;
}

function buildAvailableSlotsSection(
  slots: { date: string; slots: string[] }[],
): string {
  if (slots.length === 0) return '';

  let section = `# HORARIOS DISPONIVEIS (proximos dias)`;
  slots.forEach((day) => {
    if (day.slots.length > 0) {
      section += `\n- ${day.date}: ${day.slots.join(', ')}`;
    } else {
      section += `\n- ${day.date}: Sem horarios disponiveis`;
    }
  });
  return section;
}

function buildToolInstructionsSection(settings: AiSettings): string {
  let section = `# FERRAMENTAS DISPONIVEIS
Voce tem acesso a ferramentas para executar acoes automaticamente no sistema:`;

  section += `\n- update_patient: Use quando o paciente informar seu nome completo, email ou data de nascimento. Atualize o cadastro automaticamente.`;

  if (settings.auto_schedule) {
    section += `\n- create_appointment: Use quando o paciente CONFIRMAR que quer agendar (data + horario + servico definidos). ANTES de usar, confirme TODOS os dados com o paciente.`;
  }
  if (settings.auto_confirm) {
    section += `\n- confirm_appointment: Use quando o paciente disser que quer confirmar uma consulta ja agendada.`;
  }
  if (settings.auto_cancel) {
    section += `\n- cancel_appointment: Use quando o paciente pedir para cancelar uma consulta. Sempre ofereca reagendar.`;
  }

  section += `\n\nIMPORTANTE: Use as datas no formato YYYY-MM-DD e horarios no formato HH:MM. Sempre confirme os dados com o paciente ANTES de executar a ferramenta.`;

  return section;
}

function buildSchedulingFlowSection(settings: AiSettings): string {
  let section = `# FLUXO DE AGENDAMENTO
Quando o paciente quiser agendar:
1. Pergunte qual servico deseja (se nao mencionou)
2. Mostre 3-4 horarios disponiveis proximos
3. Confirme data, horario e servico com o paciente
4. Informe o valor do servico`;

  if (settings.auto_schedule) {
    section += `\n5. Apos confirmacao do paciente, use a ferramenta create_appointment para criar o agendamento
6. Informe que o agendamento foi realizado com sucesso`;
  } else {
    section += `\n5. Informe que a consulta sera confirmada pela recepcao
6. Agradeca e se coloque a disposicao`;
  }

  return section;
}

function buildInteractionExamplesSection(assistantName: string, context: PatientContext): string {
  const name = assistantName;
  const firstService = context.services[0];
  const priceExample = firstService ? `R$ ${firstService.price.toFixed(2)}` : 'R$ XX,XX';
  const serviceExample = firstService ? firstService.name : 'Limpeza';
  const durationExample = firstService ? `${firstService.duration} minutos` : '30 minutos';

  return `# EXEMPLOS DE INTERACAO

Paciente: "Oi"
${name}: "Ola ${context.patientName}! Sou a ${name}, assistente da ${context.clinicName}. Como posso ajudar voce hoje?

Posso auxiliar com:
- Agendamento de consultas
- Informacoes sobre servicos e precos
- Confirmacao ou cancelamento de consultas

O que voce precisa?"

Paciente: "Quanto custa uma ${serviceExample.toLowerCase()}?"
${name}: "Na ${context.clinicName}, a ${serviceExample.toLowerCase()} custa ${priceExample} e dura aproximadamente ${durationExample}.

Gostaria de agendar um horario?"

Paciente: "Quero marcar uma consulta"
${name}: "Claro! Qual procedimento voce precisa?

Temos disponibilidade nos seguintes horarios:
- [listar 3-4 horarios disponiveis]

Qual fica melhor pra voce?"`;
}

function buildCustomInstructionsSection(instructions: string | null): string {
  if (!instructions) return '';
  return `# INSTRUCOES ESPECIFICAS DA CLINICA
${instructions}`;
}

function buildResponseFormatSection(): string {
  return `# FORMATO DE RESPOSTA
- Seja direta e objetiva
- Nao repita informacoes ja ditas na conversa
- Sempre termine oferecendo mais ajuda ou fazendo uma pergunta
- Use o nome do paciente na primeira interacao, depois use apenas quando natural
- Em caso de duvida sobre algo, pergunte ao paciente ao inves de assumir`;
}

// ============================================
// PERSONALITY DETECTION
// ============================================

function detectPersonalityHints(personality: string): string {
  const lower = normalizeForComparison(personality);
  const hints: string[] = [];

  if (matches(lower, ['formal', 'serio', 'seria', 'corporativ'])) {
    hints.push('Use linguagem formal, trate por Senhor/Senhora quando apropriado, evite girias.');
  }

  if (matches(lower, ['amigavel', 'amigável', 'descontraid', 'divertid', 'leve', 'informal'])) {
    hints.push('Use linguagem leve e acolhedora, trate pelo primeiro nome, use emojis com moderacao.');
  }

  if (matches(lower, ['profissional', 'tecnic', 'objetiv'])) {
    hints.push('Mantenha tom tecnico quando necessario, seja objetiva e precisa nas informacoes.');
  }

  if (matches(lower, ['empatic', 'acolhedo', 'carinho', 'cuidados'])) {
    hints.push('Demonstre empatia e cuidado genuino com o paciente, valide sentimentos e preocupacoes.');
  }

  if (hints.length === 0) {
    hints.push('Equilibre profissionalismo com simpatia, seja acessivel mas precisa.');
  }

  return hints.join('\n');
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matches(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(normalizeForComparison(kw)));
}
