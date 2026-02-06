import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

export interface CreateHofPhotoDto {
  sessionId?: string;
  photoType: 'before' | 'after';
  fileUrl: string;
  annotations?: string;
  notes?: string;
}

export interface UpdateHofPhotoDto {
  annotations?: string;
  notes?: string;
}

@Injectable()
export class HofPhotosService {
  private readonly logger = new Logger(HofPhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.hofPhoto.findMany({
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
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findBySession(clinicId: string, sessionId: string) {
    return this.prisma.hofPhoto.findMany({
      where: {
        session_id: sessionId,
        session: {
          clinic_id: clinicId,
        },
      },
      orderBy: {
        photo_type: 'asc',
      },
    });
  }

  async create(clinicId: string, patientId: string, userId: string, dto: CreateHofPhotoDto) {
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

    const photo = await this.prisma.hofPhoto.create({
      data: {
        patient_id: patientId,
        clinic_id: clinicId,
        session_id: dto.sessionId,
        photo_type: dto.photoType,
        file_url: dto.fileUrl,
        annotations: dto.annotations,
        notes: dto.notes,
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entityType: 'HofPhoto',
      entityId: photo.id,
      userId,
      clinicId,
      newValues: { photoType: dto.photoType, sessionId: dto.sessionId },
    });

    return photo;
  }

  async update(clinicId: string, photoId: string, userId: string, dto: UpdateHofPhotoDto) {
    const existing = await this.prisma.hofPhoto.findFirst({
      where: {
        id: photoId,
        clinic_id: clinicId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Foto não encontrada');
    }

    const updated = await this.prisma.hofPhoto.update({
      where: { id: photoId },
      data: {
        annotations: dto.annotations !== undefined ? dto.annotations : existing.annotations,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'HofPhoto',
      entityId: photoId,
      userId,
      clinicId,
      oldValues: existing,
      newValues: updated,
    });

    return updated;
  }

  async delete(clinicId: string, photoId: string, userId: string) {
    const photo = await this.prisma.hofPhoto.findFirst({
      where: {
        id: photoId,
        clinic_id: clinicId,
      },
    });

    if (!photo) {
      throw new NotFoundException('Foto não encontrada');
    }

    await this.prisma.hofPhoto.delete({
      where: { id: photoId },
    });

    await this.auditService.log({
      action: 'DELETE',
      entityType: 'HofPhoto',
      entityId: photoId,
      userId,
      clinicId,
      oldValues: photo,
    });

    return { success: true };
  }
}
