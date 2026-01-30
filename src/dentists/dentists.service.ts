import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDentistDto } from './dto/create-dentist.dto';
import { UpdateDentistDto } from './dto/update-dentist.dto';

interface FindAllOptions {
  status?: string;
}

@Injectable()
export class DentistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(clinicId: string, options: FindAllOptions = {}) {
    const where: Record<string, unknown> = { clinic_id: clinicId };

    where.status = options.status || 'active';

    return this.prisma.dentist.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });
  }

  async findOne(clinicId: string, id: string) {
    const dentist = await this.prisma.dentist.findFirst({
      where: { id, clinic_id: clinicId },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!dentist) {
      throw new NotFoundException('Dentist not found');
    }

    return dentist;
  }

  async create(clinicId: string, createDentistDto: CreateDentistDto, userId: string) {
    const existing = await this.prisma.dentist.findFirst({
      where: {
        clinic_id: clinicId,
        cro: createDentistDto.cro,
      },
    });

    if (existing) {
      throw new ConflictException('Dentist with this CRO already exists');
    }

    const dentist = await this.prisma.dentist.create({
      data: {
        clinic_id: clinicId,
        name: createDentistDto.name,
        cro: createDentistDto.cro,
        specialty: createDentistDto.specialty,
        phone: createDentistDto.phone,
        email: createDentistDto.email,
        status: 'active',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Dentist',
      entityId: dentist.id,
      clinicId,
      userId,
      newValues: createDentistDto,
    });

    return dentist;
  }

  async update(clinicId: string, id: string, updateDentistDto: UpdateDentistDto, userId: string) {
    const dentist = await this.findOne(clinicId, id);

    if (updateDentistDto.cro && updateDentistDto.cro !== dentist.cro) {
      const existing = await this.prisma.dentist.findFirst({
        where: {
          clinic_id: clinicId,
          cro: updateDentistDto.cro,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Another dentist with this CRO already exists');
      }
    }

    const updated = await this.prisma.dentist.update({
      where: { id },
      data: updateDentistDto,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Dentist',
      entityId: id,
      clinicId,
      userId,
      oldValues: dentist,
      newValues: updateDentistDto,
    });

    return updated;
  }

  async remove(clinicId: string, id: string, userId: string) {
    const dentist = await this.findOne(clinicId, id);

    await this.prisma.dentist.update({
      where: { id },
      data: { status: 'inactive' },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Dentist',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: dentist.status },
      newValues: { status: 'inactive' },
    });

    return { message: 'Dentist deactivated successfully' };
  }
}
