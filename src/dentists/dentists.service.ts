import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/cache.service';
import { CreateDentistDto } from './dto/create-dentist.dto';
import { UpdateDentistDto } from './dto/update-dentist.dto';

interface FindAllOptions {
  status?: string;
  search?: string;
}

const FIVE_MINUTES = 5 * 60 * 1000;

@Injectable()
export class DentistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cacheService: RedisCacheService,
  ) {}

  async findAll(clinicId: string, options: FindAllOptions = {}) {
    const status = options.status || 'active';
    const search = options.search || '';

    // Don't cache search queries (too many variations)
    if (search) {
      return this.fetchDentists(clinicId, status, search);
    }

    // Cache list queries (most common case)
    const cacheKey = `dentists:list:${clinicId}:${status}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.fetchDentists(clinicId, status, ''),
      FIVE_MINUTES,
    );
  }

  private async fetchDentists(clinicId: string, status: string, search: string) {
    const where: Record<string, unknown> = { clinic_id: clinicId, deleted_at: null, status };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cro: { contains: search, mode: 'insensitive' } },
        { specialty: { contains: search, mode: 'insensitive' } },
      ];
    }

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
      where: { id, clinic_id: clinicId, deleted_at: null },
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
        deleted_at: null,
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

    // Invalidate cache
    await this.cacheService.invalidateMany([
      `dentists:list:${clinicId}:active`,
      `dentists:list:${clinicId}:inactive`,
    ]);

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
          deleted_at: null,
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

    // Invalidate cache
    await this.cacheService.invalidateMany([
      `dentists:list:${clinicId}:active`,
      `dentists:list:${clinicId}:inactive`,
    ]);

    return updated;
  }

  async remove(clinicId: string, id: string, userId: string) {
    const dentist = await this.findOne(clinicId, id);

    await this.prisma.dentist.update({
      where: { id },
      data: { status: 'inactive', deleted_at: new Date() },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Dentist',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: dentist.status, deleted_at: null },
      newValues: { status: 'inactive', deleted_at: new Date() },
    });

    // Invalidate cache
    await this.cacheService.invalidateMany([
      `dentists:list:${clinicId}:active`,
      `dentists:list:${clinicId}:inactive`,
    ]);

    return { message: 'Dentist deactivated successfully' };
  }

  async restore(clinicId: string, id: string, userId: string) {
    const dentist = await this.prisma.dentist.findFirst({
      where: { id, clinic_id: clinicId, deleted_at: { not: null } },
    });

    if (!dentist) {
      throw new NotFoundException('Dentist not found or not deleted');
    }

    const restored = await this.prisma.dentist.update({
      where: { id },
      data: { status: 'active', deleted_at: null },
    });

    await this.auditService.log({
      action: 'RESTORE',
      entity: 'Dentist',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: dentist.status, deleted_at: dentist.deleted_at },
      newValues: { status: 'active', deleted_at: null },
    });

    return restored;
  }
}
