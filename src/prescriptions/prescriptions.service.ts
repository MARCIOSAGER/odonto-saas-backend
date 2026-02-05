import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { PdfGeneratorService } from './pdf-generator.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly queueService: QueueService,
  ) {}

  async create(clinicId: string, dto: CreatePrescriptionDto) {
    const prescription = await this.prisma.prescription.create({
      data: {
        clinic_id: clinicId,
        patient_id: dto.patient_id,
        dentist_id: dto.dentist_id,
        type: dto.type,
        content: dto.content as any,
      },
      include: {
        patient: { select: { name: true, phone: true, cpf: true } },
        dentist: { select: { name: true, cro: true } },
      },
    });

    // Generate PDF via queue (async) or fall back to synchronous generation
    const queued = await this.queueService.addPdfJob({
      prescriptionId: prescription.id,
      clinicId,
    });
    if (!queued) {
      this.pdfGenerator.generatePdf(prescription.id, clinicId).catch((err) => {
        this.logger.error(`PDF generation failed for ${prescription.id}: ${err}`);
      });
    }

    return prescription;
  }

  async generatePdf(clinicId: string, id: string) {
    await this.findById(clinicId, id);
    return this.pdfGenerator.generatePdf(id, clinicId);
  }

  async findAll(clinicId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [prescriptions, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where: { clinic_id: clinicId, deleted_at: null },
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: {
          patient: { select: { name: true } },
          dentist: { select: { name: true, cro: true } },
        },
      }),
      this.prisma.prescription.count({ where: { clinic_id: clinicId, deleted_at: null } }),
    ]);

    return {
      data: prescriptions,
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  async findByPatient(clinicId: string, patientId: string) {
    return this.prisma.prescription.findMany({
      where: { clinic_id: clinicId, patient_id: patientId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      include: {
        dentist: { select: { name: true, cro: true } },
      },
    });
  }

  async findById(clinicId: string, id: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, clinic_id: clinicId, deleted_at: null },
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
      where: { id, clinic_id: clinicId, deleted_at: null },
    });

    if (!prescription) {
      throw new NotFoundException('Prescrição não encontrada');
    }

    return this.prisma.prescription.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async restore(clinicId: string, id: string) {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, clinic_id: clinicId, deleted_at: { not: null } },
    });

    if (!prescription) {
      throw new NotFoundException('Prescrição não encontrada ou não deletada');
    }

    return this.prisma.prescription.update({
      where: { id },
      data: { deleted_at: null },
    });
  }
}
