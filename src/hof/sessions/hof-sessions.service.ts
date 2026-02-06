import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';

export interface CreateHofSessionDto {
  sessionDate: string;
  dentistId?: string;
  postProcedureNotes?: string;
  followUpStatus?: string;
  followUpDate?: string;
  totalValue?: number;
  status?: string;
}

export interface UpdateHofSessionDto {
  postProcedureNotes?: string;
  followUpStatus?: string;
  followUpDate?: string;
  totalValue?: number;
  status?: string;
}

@Injectable()
export class HofSessionsService {
  private readonly logger = new Logger(HofSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findByPatient(clinicId: string, patientId: string) {
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

    return this.prisma.hofSession.findMany({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
      include: {
        entries: {
          where: {
            superseded_at: null,
          },
        },
        photos: true,
        consent: true,
        planItems: true,
      },
      orderBy: {
        session_date: 'desc',
      },
    });
  }

  async findById(clinicId: string, sessionId: string) {
    const session = await this.prisma.hofSession.findFirst({
      where: {
        id: sessionId,
        clinic_id: clinicId,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        entries: {
          where: {
            superseded_at: null,
          },
        },
        photos: true,
        consent: true,
        planItems: true,
        faceogram: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    return session;
  }

  async create(clinicId: string, patientId: string, userId: string, dto: CreateHofSessionDto) {
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

    // Get or create faceogram
    let faceogram = await this.prisma.faceogram.findFirst({
      where: {
        patient_id: patientId,
        clinic_id: clinicId,
      },
    });

    if (!faceogram) {
      faceogram = await this.prisma.faceogram.create({
        data: {
          patient_id: patientId,
          clinic_id: clinicId,
          created_by: userId,
        },
      });
    }

    const session = await this.prisma.hofSession.create({
      data: {
        patient_id: patientId,
        clinic_id: clinicId,
        faceogram_id: faceogram.id,
        dentist_id: dto.dentistId,
        session_date: new Date(dto.sessionDate),
        post_procedure_notes: dto.postProcedureNotes,
        follow_up_status: dto.followUpStatus || 'pending',
        follow_up_date: dto.followUpDate ? new Date(dto.followUpDate) : null,
        total_value: dto.totalValue,
        status: dto.status || 'completed',
      },
      include: {
        patient: {
          select: {
            name: true,
          },
        },
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'HofSession',
      entityId: session.id,
      userId,
      clinicId,
      newValues: session,
    });

    // Send notification
    await this.notificationsService.create({
      clinicId,
      type: 'hof_session_created',
      title: 'Nova sessão HOF',
      message: `Sessão HOF criada para ${session.patient.name}`,
      data: { sessionId: session.id, patientId },
    });

    this.logger.log(`HOF Session created: ${session.id} for patient ${patientId}`);

    return session;
  }

  async update(clinicId: string, sessionId: string, userId: string, dto: UpdateHofSessionDto) {
    const existing = await this.prisma.hofSession.findFirst({
      where: {
        id: sessionId,
        clinic_id: clinicId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Sessão não encontrada');
    }

    const updated = await this.prisma.hofSession.update({
      where: { id: sessionId },
      data: {
        post_procedure_notes:
          dto.postProcedureNotes !== undefined
            ? dto.postProcedureNotes
            : existing.post_procedure_notes,
        follow_up_status:
          dto.followUpStatus !== undefined ? dto.followUpStatus : existing.follow_up_status,
        follow_up_date:
          dto.followUpDate !== undefined
            ? dto.followUpDate
              ? new Date(dto.followUpDate)
              : null
            : existing.follow_up_date,
        total_value: dto.totalValue !== undefined ? dto.totalValue : existing.total_value,
        status: dto.status !== undefined ? dto.status : existing.status,
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'HofSession',
      entityId: sessionId,
      userId,
      clinicId,
      oldValues: existing,
      newValues: updated,
    });

    return updated;
  }

  async delete(clinicId: string, sessionId: string, userId: string) {
    const session = await this.prisma.hofSession.findFirst({
      where: {
        id: sessionId,
        clinic_id: clinicId,
      },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    await this.prisma.hofSession.delete({
      where: { id: sessionId },
    });

    await this.auditService.log({
      action: 'DELETE',
      entityType: 'HofSession',
      entityId: sessionId,
      userId,
      clinicId,
      oldValues: session,
    });

    return { success: true };
  }
}
