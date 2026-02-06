import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { FitzpatrickType } from '@prisma/client';

export interface CreateHofAnamnesisDto {
  allergyAnesthetics?: boolean;
  allergyHa?: boolean;
  allergyBotulinumToxin?: boolean;
  allergyOther?: string;
  usesAnticoagulants?: boolean;
  usesNsaids?: boolean;
  medicationsDetails?: string;
  previousProcedures?: string;
  autoimmuneDiseases?: boolean;
  autoimmuneDetails?: string;
  isPregnantLactating?: boolean;
  keloidHistory?: boolean;
  fitzpatrickType?: FitzpatrickType;
  patientExpectations?: string;
  referencePhotos?: string;
}

@Injectable()
export class HofAnamnesisService {
  private readonly logger = new Logger(HofAnamnesisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findByPatient(clinicId: string, patientId: string) {
    // Verify patient exists
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        clinic_id: clinicId,
        deleted_at: null,
      },
    });

    if (!patient) {
      throw new NotFoundException('Paciente não encontrado');
    }

    return this.prisma.hofAnamnesis.findMany({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findLatest(clinicId: string, patientId: string) {
    return this.prisma.hofAnamnesis.findFirst({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async create(clinicId: string, patientId: string, userId: string, dto: CreateHofAnamnesisDto) {
    // Verify patient exists
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        clinic_id: clinicId,
        deleted_at: null,
      },
    });

    if (!patient) {
      throw new NotFoundException('Paciente não encontrado');
    }

    const anamnesis = await this.prisma.hofAnamnesis.create({
      data: {
        patient_id: patientId,
        clinic_id: clinicId,
        filled_by_id: userId,
        allergy_anesthetics: dto.allergyAnesthetics ?? false,
        allergy_ha: dto.allergyHa ?? false,
        allergy_botulinum_toxin: dto.allergyBotulinumToxin ?? false,
        allergy_other: dto.allergyOther,
        uses_anticoagulants: dto.usesAnticoagulants ?? false,
        uses_nsaids: dto.usesNsaids ?? false,
        medications_details: dto.medicationsDetails,
        previous_procedures: dto.previousProcedures,
        autoimmune_diseases: dto.autoimmuneDiseases ?? false,
        autoimmune_details: dto.autoimmuneDetails,
        is_pregnant_lactating: dto.isPregnantLactating ?? false,
        keloid_history: dto.keloidHistory ?? false,
        fitzpatrick_type: dto.fitzpatrickType,
        patient_expectations: dto.patientExpectations,
        reference_photos: dto.referencePhotos,
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'HofAnamnesis',
      entityId: anamnesis.id,
      userId,
      clinicId,
      newValues: anamnesis,
    });

    this.logger.log(`HOF Anamnesis created: ${anamnesis.id} for patient ${patientId}`);

    return anamnesis;
  }

  async update(
    clinicId: string,
    anamnesisId: string,
    userId: string,
    dto: Partial<CreateHofAnamnesisDto>,
  ) {
    const existing = await this.prisma.hofAnamnesis.findFirst({
      where: {
        id: anamnesisId,
        clinic_id: clinicId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Anamnese HOF não encontrada');
    }

    const updated = await this.prisma.hofAnamnesis.update({
      where: { id: anamnesisId },
      data: {
        allergy_anesthetics: dto.allergyAnesthetics ?? existing.allergy_anesthetics,
        allergy_ha: dto.allergyHa ?? existing.allergy_ha,
        allergy_botulinum_toxin: dto.allergyBotulinumToxin ?? existing.allergy_botulinum_toxin,
        allergy_other: dto.allergyOther !== undefined ? dto.allergyOther : existing.allergy_other,
        uses_anticoagulants: dto.usesAnticoagulants ?? existing.uses_anticoagulants,
        uses_nsaids: dto.usesNsaids ?? existing.uses_nsaids,
        medications_details:
          dto.medicationsDetails !== undefined
            ? dto.medicationsDetails
            : existing.medications_details,
        previous_procedures:
          dto.previousProcedures !== undefined
            ? dto.previousProcedures
            : existing.previous_procedures,
        autoimmune_diseases: dto.autoimmuneDiseases ?? existing.autoimmune_diseases,
        autoimmune_details:
          dto.autoimmuneDetails !== undefined ? dto.autoimmuneDetails : existing.autoimmune_details,
        is_pregnant_lactating: dto.isPregnantLactating ?? existing.is_pregnant_lactating,
        keloid_history: dto.keloidHistory ?? existing.keloid_history,
        fitzpatrick_type:
          dto.fitzpatrickType !== undefined ? dto.fitzpatrickType : existing.fitzpatrick_type,
        patient_expectations:
          dto.patientExpectations !== undefined
            ? dto.patientExpectations
            : existing.patient_expectations,
        reference_photos:
          dto.referencePhotos !== undefined ? dto.referencePhotos : existing.reference_photos,
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'HofAnamnesis',
      entityId: anamnesisId,
      userId,
      clinicId,
      oldValues: existing,
      newValues: updated,
    });

    return updated;
  }
}
