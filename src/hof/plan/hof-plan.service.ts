import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { FacialRegion, HofProcedureType } from '@prisma/client';

export interface CreateHofPlanItemDto {
  facialRegion: FacialRegion;
  procedureType: HofProcedureType;
  productName?: string;
  quantity?: string;
  estimatedValue?: number;
  notes?: string;
  sortOrder?: number;
}

export interface UpdateHofPlanItemDto {
  productName?: string;
  quantity?: string;
  estimatedValue?: number;
  actualValue?: number;
  status?: string;
  notes?: string;
  sortOrder?: number;
}

@Injectable()
export class HofPlanService {
  private readonly logger = new Logger(HofPlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.hofPlanItem.findMany({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
      include: {
        session: {
          select: {
            id: true,
            session_date: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { sort_order: 'asc' }],
    });
  }

  async create(clinicId: string, patientId: string, userId: string, dto: CreateHofPlanItemDto) {
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

    const item = await this.prisma.hofPlanItem.create({
      data: {
        patient_id: patientId,
        clinic_id: clinicId,
        facial_region: dto.facialRegion,
        procedure_type: dto.procedureType,
        product_name: dto.productName,
        quantity: dto.quantity,
        estimated_value: dto.estimatedValue,
        notes: dto.notes,
        sort_order: dto.sortOrder || 0,
        status: 'planned',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'HofPlanItem',
      entityId: item.id,
      userId,
      clinicId,
      newValues: item,
    });

    return item;
  }

  async update(clinicId: string, itemId: string, userId: string, dto: UpdateHofPlanItemDto) {
    const existing = await this.prisma.hofPlanItem.findFirst({
      where: {
        id: itemId,
        clinic_id: clinicId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Item do plano não encontrado');
    }

    const updated = await this.prisma.hofPlanItem.update({
      where: { id: itemId },
      data: {
        product_name: dto.productName !== undefined ? dto.productName : existing.product_name,
        quantity: dto.quantity !== undefined ? dto.quantity : existing.quantity,
        estimated_value:
          dto.estimatedValue !== undefined ? dto.estimatedValue : existing.estimated_value,
        actual_value: dto.actualValue !== undefined ? dto.actualValue : existing.actual_value,
        status: dto.status !== undefined ? dto.status : existing.status,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
        sort_order: dto.sortOrder !== undefined ? dto.sortOrder : existing.sort_order,
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'HofPlanItem',
      entityId: itemId,
      userId,
      clinicId,
      oldValues: existing,
      newValues: updated,
    });

    return updated;
  }

  async complete(clinicId: string, itemId: string, userId: string, sessionId: string) {
    const existing = await this.prisma.hofPlanItem.findFirst({
      where: {
        id: itemId,
        clinic_id: clinicId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Item do plano não encontrado');
    }

    const session = await this.prisma.hofSession.findFirst({
      where: {
        id: sessionId,
        clinic_id: clinicId,
      },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    const updated = await this.prisma.hofPlanItem.update({
      where: { id: itemId },
      data: {
        status: 'done',
        session_id: sessionId,
        completed_at: new Date(),
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'HofPlanItem',
      entityId: itemId,
      userId,
      clinicId,
      oldValues: { status: existing.status },
      newValues: { status: 'done', session_id: sessionId },
    });

    return updated;
  }

  async delete(clinicId: string, itemId: string, userId: string) {
    const item = await this.prisma.hofPlanItem.findFirst({
      where: {
        id: itemId,
        clinic_id: clinicId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item do plano não encontrado');
    }

    await this.prisma.hofPlanItem.delete({
      where: { id: itemId },
    });

    await this.auditService.log({
      action: 'DELETE',
      entityType: 'HofPlanItem',
      entityId: itemId,
      userId,
      clinicId,
      oldValues: item,
    });

    return { success: true };
  }

  async calculateTotal(clinicId: string, patientId: string) {
    const items = await this.prisma.hofPlanItem.findMany({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
        status: { not: 'cancelled' },
      },
      select: {
        estimated_value: true,
        actual_value: true,
        status: true,
      },
    });

    const totals = items.reduce(
      (acc, item) => {
        const estimated = item.estimated_value ? Number(item.estimated_value) : 0;
        const actual = item.actual_value ? Number(item.actual_value) : 0;
        acc.estimatedTotal += estimated;
        if (item.status === 'done') {
          acc.actualTotal += actual || estimated;
        }
        return acc;
      },
      { estimatedTotal: 0, actualTotal: 0 },
    );

    return {
      estimatedTotal: totals.estimatedTotal,
      actualTotal: totals.actualTotal,
      itemCount: items.length,
      completedCount: items.filter((i) => i.status === 'done').length,
    };
  }
}
