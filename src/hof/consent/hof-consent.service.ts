import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

export interface CreateHofConsentDto {
  templateContent: string;
}

export interface SignHofConsentDto {
  signatureData: string;
}

// Default consent template
const DEFAULT_CONSENT_TEMPLATE = `
# TERMO DE CONSENTIMENTO INFORMADO
## Procedimento de Harmonização Orofacial

Eu, **{{patientName}}**, portador(a) do CPF **{{patientCpf}}**, declaro que:

1. Fui informado(a) sobre o(s) procedimento(s) a ser(em) realizado(s): **{{procedures}}**

2. Compreendo que os procedimentos de harmonização orofacial podem incluir:
   - Aplicação de toxina botulínica
   - Preenchimento com ácido hialurônico
   - Bioestimuladores de colágeno
   - Fios de sustentação
   - Outros procedimentos estéticos faciais

3. Estou ciente dos possíveis efeitos colaterais, como:
   - Edema (inchaço) local
   - Hematomas
   - Assimetria temporária
   - Dor ou desconforto no local da aplicação
   - Reações alérgicas (raras)

4. Declaro ter informado ao profissional sobre meu histórico médico, alergias, medicamentos em uso e tratamentos anteriores.

5. Autorizo a realização de registro fotográfico para acompanhamento do tratamento.

6. Compreendo que os resultados podem variar de pessoa para pessoa e que não há garantia de resultado específico.

**Data:** {{date}}

**Local:** {{clinicName}}

**Profissional responsável:** {{dentistName}}

---

**Assinatura do paciente:**
`;

@Injectable()
export class HofConsentService {
  private readonly logger = new Logger(HofConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findBySession(clinicId: string, sessionId: string) {
    const consent = await this.prisma.hofConsent.findFirst({
      where: {
        session_id: sessionId,
        clinic_id: clinicId,
      },
    });

    return consent;
  }

  async create(clinicId: string, sessionId: string, userId: string, dto?: CreateHofConsentDto) {
    // Check if session exists
    const session = await this.prisma.hofSession.findFirst({
      where: {
        id: sessionId,
        clinic_id: clinicId,
      },
      include: {
        patient: true,
        entries: {
          where: {
            superseded_at: null,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    // Check if consent already exists
    const existing = await this.prisma.hofConsent.findFirst({
      where: {
        session_id: sessionId,
      },
    });

    if (existing) {
      throw new BadRequestException('Termo de consentimento já existe para esta sessão');
    }

    // Get clinic info
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    // Get dentist info if available
    let dentistName = 'Profissional responsável';
    if (session.dentist_id) {
      const dentist = await this.prisma.dentist.findUnique({
        where: { id: session.dentist_id },
      });
      if (dentist) {
        dentistName = dentist.name;
      }
    }

    // Build procedures list from entries
    const procedures = session.entries
      .map((e) => `${e.facial_region} - ${e.procedure_type}`)
      .join(', ');

    // Use provided template or default
    let templateContent = dto?.templateContent || DEFAULT_CONSENT_TEMPLATE;

    // Replace placeholders
    templateContent = templateContent
      .replace(/{{patientName}}/g, session.patient.name)
      .replace(/{{patientCpf}}/g, session.patient.cpf || 'Não informado')
      .replace(/{{procedures}}/g, procedures || 'A definir')
      .replace(/{{date}}/g, new Date().toLocaleDateString('pt-BR'))
      .replace(/{{clinicName}}/g, clinic?.name || 'Clínica')
      .replace(/{{dentistName}}/g, dentistName);

    const consent = await this.prisma.hofConsent.create({
      data: {
        patient_id: session.patient_id,
        clinic_id: clinicId,
        session_id: sessionId,
        template_content: templateContent,
        status: 'pending',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'HofConsent',
      entityId: consent.id,
      userId,
      clinicId,
      newValues: { sessionId, status: 'pending' },
    });

    return consent;
  }

  async sign(clinicId: string, consentId: string, userId: string, dto: SignHofConsentDto) {
    const consent = await this.prisma.hofConsent.findFirst({
      where: {
        id: consentId,
        clinic_id: clinicId,
      },
    });

    if (!consent) {
      throw new NotFoundException('Termo de consentimento não encontrado');
    }

    if (consent.status === 'signed') {
      throw new BadRequestException('Termo já foi assinado');
    }

    const updated = await this.prisma.hofConsent.update({
      where: { id: consentId },
      data: {
        signature_data: dto.signatureData,
        signed_at: new Date(),
        status: 'signed',
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'HofConsent',
      entityId: consentId,
      userId,
      clinicId,
      oldValues: { status: 'pending' },
      newValues: { status: 'signed', signed_at: updated.signed_at },
    });

    return updated;
  }

  async getDefaultTemplate() {
    return {
      template: DEFAULT_CONSENT_TEMPLATE,
    };
  }
}
