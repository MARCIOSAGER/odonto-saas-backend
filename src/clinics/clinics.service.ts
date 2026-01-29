import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

interface FindAllOptions {
  page?: number;
  limit?: number;
  status?: string;
}

@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(options: FindAllOptions = {}) {
    const { page = 1, limit = 10, status } = options;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [clinics, total] = await Promise.all([
      this.prisma.clinic.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: {
              patients: true,
              appointments: true,
              dentists: true,
            },
          },
        },
      }),
      this.prisma.clinic.count({ where }),
    ]);

    return {
      data: clinics,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            patients: true,
            appointments: true,
            dentists: true,
            services: true,
          },
        },
      },
    });

    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }

    return clinic;
  }

  async findByCnpj(cnpj: string) {
    return this.prisma.clinic.findUnique({
      where: { cnpj },
    });
  }

  async create(createClinicDto: CreateClinicDto, userId: string) {
    const existing = await this.findByCnpj(createClinicDto.cnpj);

    if (existing) {
      throw new ConflictException('CNPJ already registered');
    }

    const clinic = await this.prisma.clinic.create({
      data: {
        name: createClinicDto.name,
        cnpj: createClinicDto.cnpj,
        phone: createClinicDto.phone,
        email: createClinicDto.email,
        address: createClinicDto.address,
        city: createClinicDto.city,
        state: createClinicDto.state,
        plan: createClinicDto.plan || 'basic',
        status: 'active',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Clinic',
      entityId: clinic.id,
      clinicId: clinic.id,
      userId,
      newValues: createClinicDto,
    });

    return clinic;
  }

  async update(id: string, updateClinicDto: UpdateClinicDto, userId: string) {
    const clinic = await this.findOne(id);

    if (updateClinicDto.cnpj && updateClinicDto.cnpj !== clinic.cnpj) {
      const existing = await this.findByCnpj(updateClinicDto.cnpj);
      if (existing) {
        throw new ConflictException('CNPJ already registered');
      }
    }

    const updated = await this.prisma.clinic.update({
      where: { id },
      data: updateClinicDto,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Clinic',
      entityId: id,
      clinicId: id,
      userId,
      oldValues: clinic,
      newValues: updateClinicDto,
    });

    return updated;
  }

  async remove(id: string, userId: string) {
    const clinic = await this.findOne(id);

    await this.prisma.clinic.update({
      where: { id },
      data: { status: 'inactive' },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Clinic',
      entityId: id,
      clinicId: id,
      userId,
      oldValues: { status: clinic.status },
      newValues: { status: 'inactive' },
    });

    return { message: 'Clinic deactivated successfully' };
  }

  async getStats(clinicId: string) {
    const [
      totalPatients,
      totalAppointments,
      pendingAppointments,
      completedAppointments,
      todayAppointments,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { clinic_id: clinicId, status: 'active' } }),
      this.prisma.appointment.count({ where: { clinic_id: clinicId } }),
      this.prisma.appointment.count({
        where: { clinic_id: clinicId, status: 'scheduled' },
      }),
      this.prisma.appointment.count({
        where: { clinic_id: clinicId, status: 'completed' },
      }),
      this.prisma.appointment.count({
        where: {
          clinic_id: clinicId,
          date: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
    ]);

    return {
      patients: {
        total: totalPatients,
      },
      appointments: {
        total: totalAppointments,
        pending: pendingAppointments,
        completed: completedAppointments,
        today: todayAppointments,
      },
    };
  }
}
