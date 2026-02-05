import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DentistsService } from './dentists.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/cache.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('DentistsService', () => {
  let service: DentistsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };
  let cacheService: { getOrSet: jest.Mock; invalidateMany: jest.Mock };

  const clinicId = 'clinic-uuid-1';
  const userId = 'user-uuid-1';

  const mockDentist = {
    id: 'dentist-uuid-1',
    clinic_id: clinicId,
    name: 'Dr. Carlos',
    cro: 'CRO-SP-12345',
    specialty: 'Ortodontia',
    phone: '11999999999',
    email: 'carlos@clinic.com',
    status: 'active',
    deleted_at: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    _count: { appointments: 5 },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    cacheService = {
      getOrSet: jest.fn().mockImplementation((_key, factory) => factory()),
      invalidateMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DentistsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: RedisCacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<DentistsService>(DentistsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return dentists filtered by clinic_id, deleted_at: null, and default status active', async () => {
      const dentists = [mockDentist];
      prisma.dentist.findMany.mockResolvedValue(dentists);

      const result = await service.findAll(clinicId);

      expect(result).toEqual(dentists);
      expect(prisma.dentist.findMany).toHaveBeenCalledWith({
        where: {
          clinic_id: clinicId,
          deleted_at: null,
          status: 'active',
        },
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { appointments: true },
          },
        },
      });
    });

    it('should apply custom status filter', async () => {
      prisma.dentist.findMany.mockResolvedValue([]);

      await service.findAll(clinicId, { status: 'inactive' });

      expect(prisma.dentist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinic_id: clinicId,
            deleted_at: null,
            status: 'inactive',
          }),
        }),
      );
    });

    it('should return empty array when no dentists found', async () => {
      prisma.dentist.findMany.mockResolvedValue([]);

      const result = await service.findAll(clinicId);

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a dentist by id', async () => {
      prisma.dentist.findFirst.mockResolvedValue(mockDentist);

      const result = await service.findOne(clinicId, mockDentist.id);

      expect(result).toEqual(mockDentist);
      expect(prisma.dentist.findFirst).toHaveBeenCalledWith({
        where: { id: mockDentist.id, clinic_id: clinicId, deleted_at: null },
        include: { _count: { select: { appointments: true } } },
      });
    });

    it('should throw NotFoundException when dentist not found', async () => {
      prisma.dentist.findFirst.mockResolvedValue(null);

      await expect(service.findOne(clinicId, 'non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      name: 'Dra. Ana',
      cro: 'CRO-SP-67890',
      specialty: 'Endodontia',
      phone: '11988887777',
      email: 'ana@clinic.com',
    };

    it('should create a dentist and log audit', async () => {
      prisma.dentist.findFirst.mockResolvedValue(null); // no CRO conflict
      const createdDentist = {
        id: 'new-dentist-uuid',
        clinic_id: clinicId,
        ...createDto,
        status: 'active',
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      prisma.dentist.create.mockResolvedValue(createdDentist);

      const result = await service.create(clinicId, createDto as any, userId);

      expect(result).toEqual(createdDentist);
      expect(prisma.dentist.findFirst).toHaveBeenCalledWith({
        where: {
          clinic_id: clinicId,
          cro: createDto.cro,
          deleted_at: null,
        },
      });
      expect(prisma.dentist.create).toHaveBeenCalledWith({
        data: {
          clinic_id: clinicId,
          name: createDto.name,
          cro: createDto.cro,
          specialty: createDto.specialty,
          phone: createDto.phone,
          email: createDto.email,
          status: 'active',
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'CREATE',
        entity: 'Dentist',
        entityId: createdDentist.id,
        clinicId,
        userId,
        newValues: createDto,
      });
    });

    it('should throw ConflictException on duplicate CRO', async () => {
      prisma.dentist.findFirst.mockResolvedValue(mockDentist); // existing CRO

      await expect(service.create(clinicId, createDto as any, userId)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.dentist.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────
  describe('update', () => {
    const updateDto = {
      name: 'Dr. Carlos Atualizado',
      specialty: 'Implantodontia',
    };

    it('should update a dentist and log audit', async () => {
      prisma.dentist.findFirst.mockResolvedValue(mockDentist); // findOne succeeds
      const updatedDentist = {
        ...mockDentist,
        ...updateDto,
        updated_at: new Date(),
      };
      prisma.dentist.update.mockResolvedValue(updatedDentist);

      const result = await service.update(clinicId, mockDentist.id, updateDto as any, userId);

      expect(result).toEqual(updatedDentist);
      expect(prisma.dentist.update).toHaveBeenCalledWith({
        where: { id: mockDentist.id },
        data: updateDto,
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE',
        entity: 'Dentist',
        entityId: mockDentist.id,
        clinicId,
        userId,
        oldValues: mockDentist,
        newValues: updateDto,
      });
    });

    it('should check CRO uniqueness when CRO is changed', async () => {
      const updateWithCro = { cro: 'CRO-SP-99999' };
      prisma.dentist.findFirst
        .mockResolvedValueOnce(mockDentist) // findOne succeeds
        .mockResolvedValueOnce(null); // no CRO conflict
      const updatedDentist = { ...mockDentist, ...updateWithCro };
      prisma.dentist.update.mockResolvedValue(updatedDentist);

      const result = await service.update(clinicId, mockDentist.id, updateWithCro as any, userId);

      expect(result).toEqual(updatedDentist);
      // Verify CRO uniqueness check was called
      expect(prisma.dentist.findFirst).toHaveBeenCalledWith({
        where: {
          clinic_id: clinicId,
          cro: 'CRO-SP-99999',
          id: { not: mockDentist.id },
          deleted_at: null,
        },
      });
    });

    it('should throw ConflictException when updated CRO already exists', async () => {
      const updateWithCro = { cro: 'CRO-SP-99999' };
      const anotherDentist = { ...mockDentist, id: 'dentist-uuid-2', cro: 'CRO-SP-99999' };
      prisma.dentist.findFirst
        .mockResolvedValueOnce(mockDentist) // findOne succeeds
        .mockResolvedValueOnce(anotherDentist); // CRO conflict found

      await expect(
        service.update(clinicId, mockDentist.id, updateWithCro as any, userId),
      ).rejects.toThrow(ConflictException);

      expect(prisma.dentist.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should not check CRO uniqueness when CRO is unchanged', async () => {
      const updateSameCro = { cro: mockDentist.cro, name: 'Dr. Carlos Novo' };
      prisma.dentist.findFirst.mockResolvedValue(mockDentist); // findOne
      const updatedDentist = { ...mockDentist, name: 'Dr. Carlos Novo' };
      prisma.dentist.update.mockResolvedValue(updatedDentist);

      await service.update(clinicId, mockDentist.id, updateSameCro as any, userId);

      // findFirst should only be called once (for findOne), not for CRO check
      expect(prisma.dentist.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if dentist does not exist', async () => {
      prisma.dentist.findFirst.mockResolvedValue(null);

      await expect(
        service.update(clinicId, 'non-existent-id', updateDto as any, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────
  // remove (soft delete)
  // ──────────────────────────────────────────────────
  describe('remove', () => {
    it('should soft delete a dentist and return success message', async () => {
      prisma.dentist.findFirst.mockResolvedValue(mockDentist);
      prisma.dentist.update.mockResolvedValue({
        ...mockDentist,
        status: 'inactive',
        deleted_at: new Date('2025-06-01'),
      });

      const result = await service.remove(clinicId, mockDentist.id, userId);

      expect(result).toEqual({ message: 'Dentist deactivated successfully' });
      expect(prisma.dentist.update).toHaveBeenCalledWith({
        where: { id: mockDentist.id },
        data: { status: 'inactive', deleted_at: expect.any(Date) },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entity: 'Dentist',
          entityId: mockDentist.id,
          clinicId,
          userId,
        }),
      );
    });

    it('should throw NotFoundException if dentist does not exist', async () => {
      prisma.dentist.findFirst.mockResolvedValue(null);

      await expect(service.remove(clinicId, 'non-existent-id', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // restore
  // ──────────────────────────────────────────────────
  describe('restore', () => {
    it('should restore a soft-deleted dentist', async () => {
      const deletedDentist = {
        ...mockDentist,
        status: 'inactive',
        deleted_at: new Date('2025-06-01'),
      };
      prisma.dentist.findFirst.mockResolvedValue(deletedDentist);
      const restoredDentist = {
        ...mockDentist,
        status: 'active',
        deleted_at: null,
      };
      prisma.dentist.update.mockResolvedValue(restoredDentist);

      const result = await service.restore(clinicId, mockDentist.id, userId);

      expect(result.status).toBe('active');
      expect(result.deleted_at).toBeNull();
      expect(prisma.dentist.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockDentist.id,
          clinic_id: clinicId,
          deleted_at: { not: null },
        },
      });
      expect(prisma.dentist.update).toHaveBeenCalledWith({
        where: { id: mockDentist.id },
        data: { status: 'active', deleted_at: null },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RESTORE',
          entity: 'Dentist',
          entityId: mockDentist.id,
          clinicId,
          userId,
        }),
      );
    });

    it('should throw NotFoundException when dentist not found or not deleted', async () => {
      prisma.dentist.findFirst.mockResolvedValue(null);

      await expect(service.restore(clinicId, 'non-existent-id', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
