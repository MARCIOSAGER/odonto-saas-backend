import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { HofProcedureType, FacialRegion, Prisma } from '@prisma/client';

export interface CreateFaceogramEntryDto {
  facialRegion: FacialRegion;
  procedureType: HofProcedureType;
  productName?: string;
  productLot?: string;
  quantity?: string;
  notes?: string;
  sessionId?: string;
}

export interface SupersedeEntryDto {
  notes?: string;
}

export interface FaceogramHistoryFilter {
  facialRegion?: FacialRegion;
  procedureType?: HofProcedureType;
  includeSuperseded?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class FaceogramService {
  private readonly logger = new Logger(FaceogramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Get or create a faceogram for a patient
   */
  async getOrCreate(clinicId: string, patientId: string, createdBy?: string) {
    // Verify patient exists and belongs to clinic
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

    // Try to find existing faceogram
    let faceogram = await this.prisma.faceogram.findFirst({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
      include: {
        entries: {
          where: {
            superseded_at: null, // Only active entries
          },
          orderBy: {
            created_at: 'desc',
          },
        },
      },
    });

    // Create if not exists
    if (!faceogram) {
      faceogram = await this.prisma.faceogram.create({
        data: {
          patient_id: patientId,
          clinic_id: clinicId,
          created_by: createdBy,
        },
        include: {
          entries: true,
        },
      });
    }

    return faceogram;
  }

  /**
   * Create a new entry in the faceogram
   */
  async createEntry(
    clinicId: string,
    userId: string,
    faceogramId: string,
    dto: CreateFaceogramEntryDto,
  ) {
    // Verify faceogram exists and belongs to clinic
    const faceogram = await this.prisma.faceogram.findFirst({
      where: {
        id: faceogramId,
        clinic_id: clinicId,
      },
    });

    if (!faceogram) {
      throw new NotFoundException('Faceograma não encontrado');
    }

    // Verify session if provided
    if (dto.sessionId) {
      const session = await this.prisma.hofSession.findFirst({
        where: {
          id: dto.sessionId,
          clinic_id: clinicId,
        },
      });

      if (!session) {
        throw new NotFoundException('Sessão não encontrada');
      }
    }

    // Create entry
    const entry = await this.prisma.faceogramEntry.create({
      data: {
        faceogram_id: faceogramId,
        session_id: dto.sessionId || null,
        facial_region: dto.facialRegion,
        procedure_type: dto.procedureType,
        product_name: dto.productName || null,
        product_lot: dto.productLot || null,
        quantity: dto.quantity || null,
        notes: dto.notes || null,
        created_by: userId,
      },
    });

    // Log audit
    await this.auditService.log({
      action: 'CREATE',
      entityType: 'FaceogramEntry',
      entityId: entry.id,
      userId,
      clinicId,
      newValues: entry,
    });

    this.logger.log(`Faceogram entry created: ${entry.id} for faceogram ${faceogramId}`);

    return entry;
  }

  /**
   * Supersede (correct) an existing entry
   */
  async supersedeEntry(clinicId: string, userId: string, entryId: string, dto: SupersedeEntryDto) {
    // Find the entry to supersede
    const oldEntry = await this.prisma.faceogramEntry.findFirst({
      where: {
        id: entryId,
        faceogram: {
          clinic_id: clinicId,
        },
        superseded_at: null, // Can only supersede active entries
      },
    });

    if (!oldEntry) {
      throw new NotFoundException('Entrada não encontrada ou já foi corrigida');
    }

    // Transaction: mark old as superseded, create new
    const result = await this.prisma.$transaction(async (tx) => {
      // Create new corrected entry
      const newEntry = await tx.faceogramEntry.create({
        data: {
          faceogram_id: oldEntry.faceogram_id,
          session_id: oldEntry.session_id,
          facial_region: oldEntry.facial_region,
          procedure_type: oldEntry.procedure_type,
          product_name: oldEntry.product_name,
          product_lot: oldEntry.product_lot,
          quantity: oldEntry.quantity,
          notes: dto.notes !== undefined ? dto.notes : oldEntry.notes,
          created_by: userId,
        },
      });

      // Mark old entry as superseded
      await tx.faceogramEntry.update({
        where: { id: entryId },
        data: {
          superseded_by: newEntry.id,
          superseded_at: new Date(),
        },
      });

      return newEntry;
    });

    // Log audit
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'FaceogramEntry',
      entityId: entryId,
      userId,
      clinicId,
      oldValues: { superseded: false },
      newValues: { superseded: true, superseded_by: result.id },
    });

    this.logger.log(`Faceogram entry ${entryId} superseded by ${result.id}`);

    return result;
  }

  /**
   * Get entry history with pagination and filters
   */
  async getHistory(clinicId: string, patientId: string, filters: FaceogramHistoryFilter) {
    const {
      facialRegion,
      procedureType,
      includeSuperseded = false,
      page = 1,
      limit = 50,
    } = filters;

    // Find faceogram
    const faceogram = await this.prisma.faceogram.findFirst({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
    });

    if (!faceogram) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const where: Prisma.FaceogramEntryWhereInput = {
      faceogram_id: faceogram.id,
    };

    if (!includeSuperseded) {
      where.superseded_at = null;
    }

    if (facialRegion) {
      where.facial_region = facialRegion;
    }

    if (procedureType) {
      where.procedure_type = procedureType;
    }

    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      this.prisma.faceogramEntry.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.faceogramEntry.count({ where }),
    ]);

    return {
      data: entries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get faceogram by session
   */
  async getBySession(clinicId: string, sessionId: string) {
    const session = await this.prisma.hofSession.findFirst({
      where: {
        id: sessionId,
        clinic_id: clinicId,
      },
      include: {
        faceogram: {
          include: {
            entries: {
              where: {
                session_id: sessionId,
                superseded_at: null,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    return session.faceogram;
  }

  /**
   * Delete an entry (soft delete via supersede with empty)
   */
  async deleteEntry(clinicId: string, userId: string, entryId: string) {
    const entry = await this.prisma.faceogramEntry.findFirst({
      where: {
        id: entryId,
        faceogram: {
          clinic_id: clinicId,
        },
        superseded_at: null,
      },
    });

    if (!entry) {
      throw new NotFoundException('Entrada não encontrada');
    }

    // Mark as superseded without creating new entry
    await this.prisma.faceogramEntry.update({
      where: { id: entryId },
      data: {
        superseded_at: new Date(),
        notes: `[REMOVIDO] ${entry.notes || ''}`,
      },
    });

    // Log audit
    await this.auditService.log({
      action: 'DELETE',
      entityType: 'FaceogramEntry',
      entityId: entryId,
      userId,
      clinicId,
      oldValues: entry,
    });

    this.logger.log(`Faceogram entry ${entryId} deleted (soft)`);

    return { success: true };
  }
}
