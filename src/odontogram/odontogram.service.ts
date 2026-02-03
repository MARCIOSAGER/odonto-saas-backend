import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { SupersedeEntryDto } from './dto/supersede-entry.dto';
import { UpdateLegendDto } from './dto/update-legend.dto';
import { OdontogramQueryDto } from './dto/odontogram-query.dto';
import { DentitionType, OdontogramEntryType, ToothSurface } from '@prisma/client';

interface DefaultLegendEntry {
  code: string;
  label: string;
  color: string;
  category: string;
  sort_order: number;
}

const DEFAULT_LEGEND: DefaultLegendEntry[] = [
  { code: 'HEALTHY', label: 'Saudavel', color: '#FFFFFF', category: 'finding', sort_order: 0 },
  { code: 'CARIES_SUSPECTED', label: 'Carie Suspeita', color: '#EF4444', category: 'finding', sort_order: 1 },
  { code: 'CARIES_ACTIVE', label: 'Carie Ativa', color: '#DC2626', category: 'finding', sort_order: 2 },
  { code: 'RESTORATION_COMPOSITE', label: 'Restauracao Resina', color: '#3B82F6', category: 'procedure', sort_order: 3 },
  { code: 'RESTORATION_AMALGAM', label: 'Restauracao Amalgama', color: '#6366F1', category: 'procedure', sort_order: 4 },
  { code: 'EXTRACTION', label: 'Extracao', color: '#9CA3AF', category: 'procedure', sort_order: 5 },
  { code: 'IMPLANT', label: 'Implante', color: '#10B981', category: 'procedure', sort_order: 6 },
  { code: 'CROWN', label: 'Coroa', color: '#F59E0B', category: 'procedure', sort_order: 7 },
  { code: 'BRIDGE', label: 'Ponte', color: '#8B5CF6', category: 'procedure', sort_order: 8 },
  { code: 'ROOT_CANAL', label: 'Tratamento de Canal', color: '#F97316', category: 'procedure', sort_order: 9 },
  { code: 'FRACTURE', label: 'Fratura', color: '#EC4899', category: 'finding', sort_order: 10 },
  { code: 'MISSING', label: 'Ausente', color: '#E5E7EB', category: 'finding', sort_order: 11 },
  { code: 'SEALANT', label: 'Selante', color: '#06B6D4', category: 'procedure', sort_order: 12 },
  { code: 'PROSTHESIS', label: 'Protese', color: '#A855F7', category: 'procedure', sort_order: 13 },
  { code: 'ORTHODONTIC_BRACKET', label: 'Braquete Ortodontico', color: '#F43F5E', category: 'procedure', sort_order: 14 },
  { code: 'PERIAPICAL_LESION', label: 'Lesao Periapical', color: '#B91C1C', category: 'finding', sort_order: 15 },
];

@Injectable()
export class OdontogramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Get or create odontogram for a patient.
   * Returns the odontogram with active (non-superseded) entries.
   */
  async getOrCreate(
    clinicId: string,
    patientId: string,
    dentitionType?: DentitionType,
  ) {
    await this.validatePatientBelongsToClinic(clinicId, patientId);

    const type = dentitionType || DentitionType.PERMANENT;

    let odontogram = await this.prisma.odontogram.findFirst({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
        dentition_type: type,
      },
      include: {
        entries: {
          where: { superseded_at: null },
          orderBy: [
            { tooth_number: 'asc' },
            { created_at: 'desc' },
          ],
        },
        treatmentPlans: {
          include: {
            items: {
              orderBy: { sort_order: 'asc' },
            },
          },
        },
      },
    });

    if (!odontogram) {
      odontogram = await this.prisma.odontogram.create({
        data: {
          patient_id: patientId,
          clinic_id: clinicId,
          dentition_type: type,
        },
        include: {
          entries: {
            where: { superseded_at: null },
            orderBy: [
              { tooth_number: 'asc' },
              { created_at: 'desc' },
            ],
          },
          treatmentPlans: {
            include: {
              items: {
                orderBy: { sort_order: 'asc' },
              },
            },
          },
        },
      });
    }

    return odontogram;
  }

  /**
   * Get entry history for a patient's odontogram with optional filters and pagination.
   */
  async getHistory(
    clinicId: string,
    patientId: string,
    filters?: OdontogramQueryDto,
  ) {
    await this.validatePatientBelongsToClinic(clinicId, patientId);

    const odontogram = await this.prisma.odontogram.findFirst({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
    });

    if (!odontogram) {
      return { data: [], meta: { total: 0, page: 1, limit: 50 } };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      odontogram_id: odontogram.id,
    };

    if (filters?.tooth_number) {
      where.tooth_number = filters.tooth_number;
    }

    if (filters?.entry_type) {
      where.entry_type = filters.entry_type;
    }

    if (!filters?.include_superseded) {
      where.superseded_at = null;
    }

    const [entries, total] = await Promise.all([
      this.prisma.odontogramEntry.findMany({
        where,
        orderBy: [
          { tooth_number: 'asc' },
          { created_at: 'desc' },
        ],
        skip,
        take: limit,
        include: {
          treatmentPlanItem: true,
          supersededByEntry: {
            select: { id: true, status_code: true, created_at: true },
          },
        },
      }),
      this.prisma.odontogramEntry.count({ where }),
    ]);

    return {
      data: entries,
      meta: { total, page, limit },
    };
  }

  /**
   * Create an immutable OdontogramEntry with audit logging.
   * If entry_type is FINDING and no treatment_plan_item_id is provided,
   * auto-creates a TreatmentPlanItem with status PLANNED.
   */
  async createEntry(
    clinicId: string,
    userId: string,
    odontogramId: string,
    dto: CreateEntryDto,
  ) {
    const odontogram = await this.prisma.odontogram.findFirst({
      where: { id: odontogramId, clinic_id: clinicId },
    });

    if (!odontogram) {
      throw new NotFoundException('Odontogram not found');
    }

    const surfaces =
      dto.surfaces && dto.surfaces.length > 0
        ? dto.surfaces
        : [ToothSurface.WHOLE];

    let treatmentPlanItemId = dto.treatment_plan_item_id || null;

    // If this is a FINDING and no treatment plan item is linked, auto-create one
    if (
      dto.entry_type === OdontogramEntryType.FINDING &&
      !treatmentPlanItemId &&
      dto.status_code !== 'HEALTHY'
    ) {
      // Find or create a treatment plan for this odontogram
      let treatmentPlan = await this.prisma.treatmentPlan.findFirst({
        where: {
          odontogram_id: odontogramId,
          patient_id: odontogram.patient_id,
          clinic_id: clinicId,
          status: { in: ['pending', 'in_progress'] },
        },
        orderBy: { created_at: 'desc' },
      });

      if (!treatmentPlan) {
        treatmentPlan = await this.prisma.treatmentPlan.create({
          data: {
            patient_id: odontogram.patient_id,
            clinic_id: clinicId,
            created_by: userId,
            odontogram_id: odontogramId,
            status: 'pending',
          },
        });
      }

      const planItem = await this.prisma.treatmentPlanItem.create({
        data: {
          treatment_plan_id: treatmentPlan.id,
          tooth_number: dto.tooth_number,
          procedure_code: dto.status_code,
          description: dto.notes || null,
          status: 'PLANNED',
          sort_order: 0,
        },
      });

      treatmentPlanItemId = planItem.id;
    }

    const entry = await this.prisma.odontogramEntry.create({
      data: {
        odontogram_id: odontogramId,
        tooth_number: dto.tooth_number,
        entry_type: dto.entry_type,
        status_code: dto.status_code,
        surfaces,
        notes: dto.notes || null,
        created_by: userId,
        treatment_plan_item_id: treatmentPlanItemId,
      },
      include: {
        treatmentPlanItem: true,
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'OdontogramEntry',
      entityId: entry.id,
      clinicId,
      userId,
      newValues: {
        tooth_number: entry.tooth_number,
        entry_type: entry.entry_type,
        status_code: entry.status_code,
        surfaces: entry.surfaces,
        notes: entry.notes,
        treatment_plan_item_id: entry.treatment_plan_item_id,
      },
    });

    return entry;
  }

  /**
   * Supersede an existing entry by marking it as superseded and creating a corrected entry.
   * Uses a Prisma transaction to ensure atomicity.
   */
  async supersedeEntry(
    clinicId: string,
    userId: string,
    entryId: string,
    dto?: SupersedeEntryDto,
  ) {
    const existingEntry = await this.prisma.odontogramEntry.findFirst({
      where: { id: entryId },
      include: {
        odontogram: true,
      },
    });

    if (!existingEntry) {
      throw new NotFoundException('Odontogram entry not found');
    }

    if (existingEntry.odontogram.clinic_id !== clinicId) {
      throw new NotFoundException('Odontogram entry not found');
    }

    if (existingEntry.superseded_at) {
      throw new BadRequestException('Entry has already been superseded');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Create the new corrected entry
      const newEntry = await tx.odontogramEntry.create({
        data: {
          odontogram_id: existingEntry.odontogram_id,
          tooth_number: existingEntry.tooth_number,
          entry_type: existingEntry.entry_type,
          status_code: existingEntry.status_code,
          surfaces: existingEntry.surfaces as ToothSurface[],
          notes: dto?.notes || existingEntry.notes,
          created_by: userId,
          treatment_plan_item_id: existingEntry.treatment_plan_item_id,
        },
      });

      // Mark the old entry as superseded
      const oldEntry = await tx.odontogramEntry.update({
        where: { id: entryId },
        data: {
          superseded_by: newEntry.id,
          superseded_at: new Date(),
        },
      });

      return { oldEntry, newEntry };
    });

    await this.auditService.log({
      action: 'SUPERSEDE',
      entity: 'OdontogramEntry',
      entityId: entryId,
      clinicId,
      userId,
      oldValues: {
        id: result.oldEntry.id,
        tooth_number: result.oldEntry.tooth_number,
        status_code: result.oldEntry.status_code,
        notes: result.oldEntry.notes,
      },
      newValues: {
        id: result.newEntry.id,
        tooth_number: result.newEntry.tooth_number,
        status_code: result.newEntry.status_code,
        notes: result.newEntry.notes,
        superseded_entry_id: entryId,
      },
    });

    return result;
  }

  /**
   * Get legend items for a clinic.
   * If none exist, seed with DEFAULT_LEGEND and return them.
   */
  async getLegend(clinicId: string) {
    let items = await this.prisma.odontogramLegendItem.findMany({
      where: { clinic_id: clinicId, is_active: true },
      orderBy: { sort_order: 'asc' },
    });

    if (items.length === 0) {
      await this.prisma.odontogramLegendItem.createMany({
        data: DEFAULT_LEGEND.map((item) => ({
          clinic_id: clinicId,
          code: item.code,
          label: item.label,
          color: item.color,
          category: item.category,
          sort_order: item.sort_order,
          is_active: true,
        })),
      });

      items = await this.prisma.odontogramLegendItem.findMany({
        where: { clinic_id: clinicId, is_active: true },
        orderBy: { sort_order: 'asc' },
      });
    }

    return items;
  }

  /**
   * Create or update a legend item for a clinic.
   * Uses upsert on the unique constraint [clinic_id, code].
   */
  async upsertLegend(clinicId: string, dto: UpdateLegendDto) {
    const item = await this.prisma.odontogramLegendItem.upsert({
      where: {
        clinic_id_code: {
          clinic_id: clinicId,
          code: dto.code,
        },
      },
      update: {
        label: dto.label,
        color: dto.color,
        icon: dto.icon !== undefined ? dto.icon : undefined,
        category: dto.category !== undefined ? dto.category : undefined,
        sort_order: dto.sort_order !== undefined ? dto.sort_order : undefined,
        is_active: dto.is_active !== undefined ? dto.is_active : undefined,
      },
      create: {
        clinic_id: clinicId,
        code: dto.code,
        label: dto.label,
        color: dto.color,
        icon: dto.icon || null,
        category: dto.category || 'general',
        sort_order: dto.sort_order ?? 0,
        is_active: dto.is_active ?? true,
      },
    });

    return item;
  }

  /**
   * Soft-delete a legend item by setting is_active = false.
   */
  async deleteLegend(clinicId: string, code: string) {
    const item = await this.prisma.odontogramLegendItem.findUnique({
      where: {
        clinic_id_code: {
          clinic_id: clinicId,
          code,
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Legend item with code "${code}" not found`);
    }

    const updated = await this.prisma.odontogramLegendItem.update({
      where: {
        clinic_id_code: {
          clinic_id: clinicId,
          code,
        },
      },
      data: { is_active: false },
    });

    return updated;
  }

  /**
   * Validate that a patient belongs to the given clinic.
   */
  private async validatePatientBelongsToClinic(
    clinicId: string,
    patientId: string,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinic_id: clinicId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }
}
