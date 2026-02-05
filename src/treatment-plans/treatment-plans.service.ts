import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';

@Injectable()
export class TreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(clinicId: string, userId: string, dto: CreateTreatmentPlanDto) {
    const plan = await this.prisma.treatmentPlan.create({
      data: {
        clinic_id: clinicId,
        created_by: userId,
        patient_id: dto.patient_id,
        patient_summary: dto.patient_summary,
        phases: dto.phases ? (dto.phases as any) : undefined,
        total_cost: dto.total_cost,
        total_sessions: dto.total_sessions,
        recommendations: dto.recommendations,
        odontogram_id: dto.odontogram_id,
        notes: dto.notes,
      },
      include: {
        patient: { select: { name: true } },
        odontogram: true,
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'TreatmentPlan',
      entityId: plan.id,
      clinicId,
      userId,
      newValues: plan,
    });

    return plan;
  }

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.treatmentPlan.findMany({
      where: { clinic_id: clinicId, patient_id: patientId },
      orderBy: { created_at: 'desc' },
      include: {
        patient: { select: { name: true } },
        odontogram: true,
      },
    });
  }

  async findById(clinicId: string, id: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id, clinic_id: clinicId },
      include: {
        patient: { select: { name: true } },
        odontogram: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Plano de tratamento não encontrado');
    }

    return plan;
  }

  async update(clinicId: string, id: string, dto: UpdateTreatmentPlanDto, userId: string) {
    const existing = await this.findById(clinicId, id);

    const plan = await this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        patient_id: dto.patient_id,
        patient_summary: dto.patient_summary,
        phases: dto.phases ? (dto.phases as any) : undefined,
        total_cost: dto.total_cost,
        total_sessions: dto.total_sessions,
        recommendations: dto.recommendations,
        odontogram_id: dto.odontogram_id,
        notes: dto.notes,
        status: dto.status,
      },
      include: {
        patient: { select: { name: true } },
        odontogram: true,
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TreatmentPlan',
      entityId: id,
      clinicId,
      userId,
      oldValues: existing,
      newValues: plan,
    });

    return plan;
  }

  async updateStatus(clinicId: string, id: string, status: string, userId: string) {
    const existing = await this.findById(clinicId, id);

    const plan = await this.prisma.treatmentPlan.update({
      where: { id },
      data: { status },
      include: {
        patient: { select: { name: true } },
        odontogram: true,
      },
    });

    await this.auditService.log({
      action: 'UPDATE_STATUS',
      entity: 'TreatmentPlan',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: existing.status },
      newValues: { status },
    });

    return plan;
  }
}
