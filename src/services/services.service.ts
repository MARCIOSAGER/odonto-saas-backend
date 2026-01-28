import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

interface FindAllOptions {
  status?: string;
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(clinicId: string, options: FindAllOptions = {}) {
    const where: Record<string, unknown> = { clinic_id: clinicId };

    if (options.status) {
      where.status = options.status;
    }

    return this.prisma.service.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(clinicId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, clinic_id: clinicId },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async create(clinicId: string, createServiceDto: CreateServiceDto, userId: string) {
    const existing = await this.prisma.service.findFirst({
      where: {
        clinic_id: clinicId,
        name: createServiceDto.name,
      },
    });

    if (existing) {
      throw new ConflictException('Service with this name already exists');
    }

    const service = await this.prisma.service.create({
      data: {
        clinic_id: clinicId,
        name: createServiceDto.name,
        description: createServiceDto.description,
        price: createServiceDto.price,
        duration: createServiceDto.duration,
        status: 'active',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Service',
      entityId: service.id,
      clinicId,
      userId,
      newValues: createServiceDto,
    });

    return service;
  }

  async update(clinicId: string, id: string, updateServiceDto: UpdateServiceDto, userId: string) {
    const service = await this.findOne(clinicId, id);

    if (updateServiceDto.name && updateServiceDto.name !== service.name) {
      const existing = await this.prisma.service.findFirst({
        where: {
          clinic_id: clinicId,
          name: updateServiceDto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Another service with this name already exists');
      }
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: updateServiceDto,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Service',
      entityId: id,
      clinicId,
      userId,
      oldValues: service,
      newValues: updateServiceDto,
    });

    return updated;
  }

  async remove(clinicId: string, id: string, userId: string) {
    const service = await this.findOne(clinicId, id);

    await this.prisma.service.update({
      where: { id },
      data: { status: 'inactive' },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Service',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: service.status },
      newValues: { status: 'inactive' },
    });

    return { message: 'Service deactivated successfully' };
  }
}
