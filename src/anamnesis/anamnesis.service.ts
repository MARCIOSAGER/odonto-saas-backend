import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';
import { CreateAnamnesisDto } from './dto/create-anamnesis.dto';
import { UpdateAnamnesisDto } from './dto/update-anamnesis.dto';

@Injectable()
export class AnamnesisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(clinicId: string, userId: string, dto: CreateAnamnesisDto) {
    const anamnesis = await this.prisma.anamnesis.create({
      data: {
        clinic_id: clinicId,
        patient_id: dto.patient_id,
        filled_by_id: userId,
        allergies: dto.allergies || [],
        medications: dto.medications || [],
        conditions: dto.conditions || [],
        surgeries: dto.surgeries,
        habits: dto.habits as Prisma.InputJsonValue,
        raw_answers: dto.raw_answers as Prisma.InputJsonValue,
      },
      include: {
        patient: { select: { name: true, phone: true, cpf: true } },
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Anamnesis',
      entityId: anamnesis.id,
      clinicId,
      userId,
      newValues: anamnesis,
    });

    return anamnesis;
  }

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.anamnesis.findMany({
      where: { clinic_id: clinicId, patient_id: patientId },
      orderBy: { created_at: 'desc' },
      include: {
        patient: { select: { name: true } },
      },
    });
  }

  async findLatest(clinicId: string, patientId: string) {
    const anamnesis = await this.prisma.anamnesis.findFirst({
      where: { clinic_id: clinicId, patient_id: patientId },
      orderBy: { created_at: 'desc' },
      include: {
        patient: { select: { name: true, phone: true, cpf: true } },
      },
    });

    return anamnesis;
  }

  async findById(clinicId: string, id: string) {
    const anamnesis = await this.prisma.anamnesis.findFirst({
      where: { id, clinic_id: clinicId },
      include: {
        patient: {
          select: {
            name: true,
            phone: true,
            cpf: true,
            email: true,
            birth_date: true,
          },
        },
      },
    });

    if (!anamnesis) {
      throw new NotFoundException('Anamnese não encontrada');
    }

    return anamnesis;
  }

  async update(clinicId: string, id: string, dto: UpdateAnamnesisDto, userId: string) {
    const existing = await this.findById(clinicId, id);

    const anamnesis = await this.prisma.anamnesis.update({
      where: { id },
      data: {
        ...(dto.allergies !== undefined && { allergies: dto.allergies }),
        ...(dto.medications !== undefined && { medications: dto.medications }),
        ...(dto.conditions !== undefined && { conditions: dto.conditions }),
        ...(dto.surgeries !== undefined && { surgeries: dto.surgeries }),
        ...(dto.habits !== undefined && { habits: dto.habits as Prisma.InputJsonValue }),
        ...(dto.raw_answers !== undefined && { raw_answers: dto.raw_answers as Prisma.InputJsonValue }),
        ...(dto.risk_classification !== undefined && { risk_classification: dto.risk_classification }),
        ...(dto.contraindications !== undefined && { contraindications: dto.contraindications }),
        ...(dto.alerts !== undefined && { alerts: dto.alerts }),
        ...(dto.warnings !== undefined && { warnings: dto.warnings }),
        ...(dto.ai_notes !== undefined && { ai_notes: dto.ai_notes }),
        ...(dto.ai_recommendations !== undefined && { ai_recommendations: dto.ai_recommendations }),
      },
      include: {
        patient: { select: { name: true, phone: true, cpf: true } },
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Anamnesis',
      entityId: id,
      clinicId,
      userId,
      oldValues: existing,
      newValues: anamnesis,
    });

    return anamnesis;
  }
}
