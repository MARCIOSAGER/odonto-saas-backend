import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateToothDto } from './dto/update-tooth.dto';

@Injectable()
export class OdontogramService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get or create odontogram for a patient
   */
  async getOrCreate(clinicId: string, patientId: string) {
    // Verify patient belongs to clinic
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinic_id: clinicId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    let odontogram = await this.prisma.odontogram.findFirst({
      where: { patient_id: patientId },
      include: {
        teeth: { orderBy: { tooth_number: 'asc' } },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!odontogram) {
      odontogram = await this.prisma.odontogram.create({
        data: { patient_id: patientId },
        include: {
          teeth: { orderBy: { tooth_number: 'asc' } },
        },
      });
    }

    return odontogram;
  }

  /**
   * Update a single tooth in the odontogram
   */
  async updateTooth(
    clinicId: string,
    patientId: string,
    dto: UpdateToothDto,
  ) {
    const odontogram = await this.getOrCreate(clinicId, patientId);

    const tooth = await this.prisma.odontogramTooth.upsert({
      where: {
        odontogram_id_tooth_number: {
          odontogram_id: odontogram.id,
          tooth_number: dto.tooth_number,
        },
      },
      update: {
        status: dto.status,
        surfaces: dto.surfaces
          ? (dto.surfaces as Prisma.InputJsonValue)
          : undefined,
        notes: dto.notes,
      },
      create: {
        odontogram_id: odontogram.id,
        tooth_number: dto.tooth_number,
        status: dto.status,
        surfaces: dto.surfaces
          ? (dto.surfaces as Prisma.InputJsonValue)
          : undefined,
        notes: dto.notes,
      },
    });

    return tooth;
  }

  /**
   * Update multiple teeth at once (batch)
   */
  async updateTeeth(
    clinicId: string,
    patientId: string,
    teeth: UpdateToothDto[],
  ) {
    const odontogram = await this.getOrCreate(clinicId, patientId);

    const results = await Promise.all(
      teeth.map((dto) =>
        this.prisma.odontogramTooth.upsert({
          where: {
            odontogram_id_tooth_number: {
              odontogram_id: odontogram.id,
              tooth_number: dto.tooth_number,
            },
          },
          update: {
            status: dto.status,
            surfaces: dto.surfaces
              ? (dto.surfaces as Prisma.InputJsonValue)
              : undefined,
            notes: dto.notes,
          },
          create: {
            odontogram_id: odontogram.id,
            tooth_number: dto.tooth_number,
            status: dto.status,
            surfaces: dto.surfaces
              ? (dto.surfaces as Prisma.InputJsonValue)
              : undefined,
            notes: dto.notes,
          },
        }),
      ),
    );

    return results;
  }

  /**
   * Get history of changes for a patient's odontogram
   */
  async getHistory(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinic_id: clinicId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const odontograms = await this.prisma.odontogram.findMany({
      where: { patient_id: patientId },
      include: {
        teeth: { orderBy: { tooth_number: 'asc' } },
      },
      orderBy: { created_at: 'desc' },
    });

    return odontograms;
  }
}
