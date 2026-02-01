import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreatePrescriptionDto {
  patient_id: string;
  dentist_id: string;
  type: 'prescription' | 'certificate' | 'referral';
  content: Record<string, unknown>;
}

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(clinicId: string, dto: CreatePrescriptionDto) {
    return this.prisma.prescription.create({
      data: {
        clinic_id: clinicId,
        patient_id: dto.patient_id,
        dentist_id: dto.dentist_id,
        type: dto.type,
        content: dto.content as Prisma.InputJsonValue,
      },
      include: {
        patient: { select: { name: true, phone: true, cpf: true } },
        dentist: { select: { name: true, cro: true } },
      },
    });
  }

  async findAll(clinicId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [prescriptions, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where: { clinic_id: clinicId },
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: {
          patient: { select: { name: true } },
          dentist: { select: { name: true, cro: true } },
        },
      }),
      this.prisma.prescription.count({ where: { clinic_id: clinicId } }),
    ]);

    return {
      data: prescriptions,
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.prescription.findMany({
      where: { clinic_id: clinicId, patient_id: patientId },
      orderBy: { created_at: 'desc' },
      include: {
        dentist: { select: { name: true, cro: true } },
      },
    });
  }

  async findById(clinicId: string, id: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, clinic_id: clinicId },
      include: {
        patient: {
          select: {
            name: true,
            phone: true,
            cpf: true,
            email: true,
            birth_date: true,
            address: true,
          },
        },
        dentist: { select: { name: true, cro: true, specialty: true } },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescrição não encontrada');
    }

    return prescription;
  }

  async markAsSent(id: string, via: string) {
    return this.prisma.prescription.update({
      where: { id },
      data: { sent_at: new Date(), sent_via: via },
    });
  }

  async delete(clinicId: string, id: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, clinic_id: clinicId },
    });

    if (!prescription) {
      throw new NotFoundException('Prescrição não encontrada');
    }

    return this.prisma.prescription.delete({ where: { id } });
  }
}
