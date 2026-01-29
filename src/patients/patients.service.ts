import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

interface FindAllOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(clinicId: string, options: FindAllOptions = {}) {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 10;
    const skip = Math.max(0, (page - 1) * limit);
    const { search, status } = options;

    const where: Record<string, unknown> = { clinic_id: clinicId };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search } },
      ];
    }

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: { appointments: true },
          },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data: patients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(clinicId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinic_id: clinicId },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  async findByPhone(clinicId: string, phone: string) {
    const normalizedPhone = phone.replace(/\D/g, '');

    const patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone: { contains: normalizedPhone },
      },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  async findOrCreateByPhone(clinicId: string, phone: string, name?: string) {
    const normalizedPhone = phone.replace(/\D/g, '');

    let patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone: normalizedPhone,
      },
    });

    if (!patient) {
      patient = await this.prisma.patient.create({
        data: {
          clinic_id: clinicId,
          phone: normalizedPhone,
          name: name || 'Novo Paciente',
          status: 'active',
        },
      });
    }

    return patient;
  }

  async create(clinicId: string, createPatientDto: CreatePatientDto, userId: string) {
    const normalizedPhone = createPatientDto.phone.replace(/\D/g, '');

    const existing = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone: normalizedPhone,
      },
    });

    if (existing) {
      throw new ConflictException('Patient with this phone already exists');
    }

    const patient = await this.prisma.patient.create({
      data: {
        clinic_id: clinicId,
        name: createPatientDto.name,
        phone: normalizedPhone,
        cpf: createPatientDto.cpf,
        email: createPatientDto.email,
        birth_date: createPatientDto.birth_date,
        address: createPatientDto.address,
        notes: createPatientDto.notes,
        status: 'active',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Patient',
      entityId: patient.id,
      clinicId,
      userId,
      newValues: createPatientDto,
    });

    return patient;
  }

  async update(clinicId: string, id: string, updatePatientDto: UpdatePatientDto, userId: string) {
    const patient = await this.findOne(clinicId, id);

    if (updatePatientDto.phone) {
      const normalizedPhone = updatePatientDto.phone.replace(/\D/g, '');

      if (normalizedPhone !== patient.phone) {
        const existing = await this.prisma.patient.findFirst({
          where: {
            clinic_id: clinicId,
            phone: normalizedPhone,
            id: { not: id },
          },
        });

        if (existing) {
          throw new ConflictException('Another patient with this phone already exists');
        }

        updatePatientDto.phone = normalizedPhone;
      }
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data: updatePatientDto,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Patient',
      entityId: id,
      clinicId,
      userId,
      oldValues: patient,
      newValues: updatePatientDto,
    });

    return updated;
  }

  async remove(clinicId: string, id: string, userId: string) {
    const patient = await this.findOne(clinicId, id);

    const updated = await this.prisma.patient.update({
      where: { id },
      data: { status: 'inactive' },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Patient',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: patient.status },
      newValues: { status: 'inactive' },
    });

    return updated;
  }

  async getAppointments(clinicId: string, patientId: string, limit = 10) {
    await this.findOne(clinicId, patientId);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        patient_id: patientId,
      },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        service: {
          select: { id: true, name: true, price: true },
        },
        dentist: {
          select: { id: true, name: true, specialty: true },
        },
      },
    });

    return appointments;
  }
}
