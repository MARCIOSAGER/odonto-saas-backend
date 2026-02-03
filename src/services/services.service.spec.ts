import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };

  const clinicId = 'clinic-uuid-1';
  const userId = 'user-uuid-1';

  const mockService = {
    id: 'service-uuid-1',
    clinic_id: clinicId,
    name: 'Limpeza',
    description: 'Limpeza dental completa',
    price: 150,
    duration: 60,
    status: 'active',
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return services filtered by clinic_id with default status active', async () => {
      const services = [mockService];
      prisma.service.findMany.mockResolvedValue(services);

      const result = await service.findAll(clinicId);

      expect(result).toEqual(services);
      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, status: 'active' },
        orderBy: { name: 'asc' },
      });
    });

    it('should filter by custom status when provided', async () => {
      prisma.service.findMany.mockResolvedValue([]);

      await service.findAll(clinicId, { status: 'inactive' });

      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, status: 'inactive' },
        orderBy: { name: 'asc' },
      });
    });

    it('should return empty array when no services found', async () => {
      prisma.service.findMany.mockResolvedValue([]);

      const result = await service.findAll(clinicId);

      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a service by id and clinic_id', async () => {
      prisma.service.findFirst.mockResolvedValue(mockService);

      const result = await service.findOne(clinicId, mockService.id);

      expect(result).toEqual(mockService);
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: mockService.id, clinic_id: clinicId },
      });
    });

    it('should throw NotFoundException when service not found', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(clinicId, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      name: 'Clareamento',
      description: 'Clareamento dental a laser',
      price: 500,
      duration: 90,
    };

    it('should create a service and log audit', async () => {
      prisma.service.findFirst.mockResolvedValue(null); // no duplicate
      const createdService = {
        id: 'new-service-uuid',
        clinic_id: clinicId,
        name: createDto.name,
        description: createDto.description,
        price: createDto.price,
        duration: createDto.duration,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };
      prisma.service.create.mockResolvedValue(createdService);

      const result = await service.create(clinicId, createDto as any, userId);

      expect(result).toEqual(createdService);
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: {
          clinic_id: clinicId,
          name: createDto.name,
        },
      });
      expect(prisma.service.create).toHaveBeenCalledWith({
        data: {
          clinic_id: clinicId,
          name: createDto.name,
          description: createDto.description,
          price: createDto.price,
          duration: createDto.duration,
          status: 'active',
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'CREATE',
        entity: 'Service',
        entityId: createdService.id,
        clinicId,
        userId,
        newValues: createDto,
      });
    });

    it('should throw ConflictException on duplicate name', async () => {
      prisma.service.findFirst.mockResolvedValue(mockService); // existing service

      await expect(
        service.create(clinicId, createDto as any, userId),
      ).rejects.toThrow(ConflictException);

      expect(prisma.service.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────
  describe('update', () => {
    const updateDto = {
      name: 'Limpeza Premium',
      price: 200,
    };

    it('should update a service and log audit', async () => {
      // findOne mock (first call to findFirst)
      prisma.service.findFirst
        .mockResolvedValueOnce(mockService) // findOne
        .mockResolvedValueOnce(null); // name uniqueness check — no duplicate

      const updatedService = {
        ...mockService,
        name: updateDto.name,
        price: updateDto.price,
        updated_at: new Date(),
      };
      prisma.service.update.mockResolvedValue(updatedService);

      const result = await service.update(
        clinicId,
        mockService.id,
        updateDto as any,
        userId,
      );

      expect(result).toEqual(updatedService);
      // Verify findOne was called
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: mockService.id, clinic_id: clinicId },
      });
      // Verify name uniqueness check
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: {
          clinic_id: clinicId,
          name: updateDto.name,
          id: { not: mockService.id },
        },
      });
      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: mockService.id },
        data: updateDto,
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE',
        entity: 'Service',
        entityId: mockService.id,
        clinicId,
        userId,
        oldValues: mockService,
        newValues: updateDto,
      });
    });

    it('should throw ConflictException if new name already exists', async () => {
      const anotherService = {
        ...mockService,
        id: 'service-uuid-2',
        name: 'Limpeza Premium',
      };
      prisma.service.findFirst
        .mockResolvedValueOnce(mockService) // findOne
        .mockResolvedValueOnce(anotherService); // name uniqueness — conflict

      await expect(
        service.update(clinicId, mockService.id, updateDto as any, userId),
      ).rejects.toThrow(ConflictException);

      expect(prisma.service.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should skip name uniqueness check if name is not changed', async () => {
      const sameNameDto = { price: 200 };
      prisma.service.findFirst.mockResolvedValueOnce(mockService); // findOne

      const updatedService = {
        ...mockService,
        price: sameNameDto.price,
        updated_at: new Date(),
      };
      prisma.service.update.mockResolvedValue(updatedService);

      const result = await service.update(
        clinicId,
        mockService.id,
        sameNameDto as any,
        userId,
      );

      expect(result).toEqual(updatedService);
      // findFirst called only once (for findOne), not for name uniqueness
      expect(prisma.service.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.service.update).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });

    it('should skip name uniqueness check if name is the same as current', async () => {
      const sameNameDto = { name: 'Limpeza', price: 200 };
      prisma.service.findFirst.mockResolvedValueOnce(mockService); // findOne

      const updatedService = {
        ...mockService,
        price: sameNameDto.price,
        updated_at: new Date(),
      };
      prisma.service.update.mockResolvedValue(updatedService);

      const result = await service.update(
        clinicId,
        mockService.id,
        sameNameDto as any,
        userId,
      );

      expect(result).toEqual(updatedService);
      // findFirst called only once (for findOne); name unchanged so no uniqueness check
      expect(prisma.service.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if service does not exist', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(
        service.update(clinicId, 'non-existent-id', updateDto as any, userId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.service.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // remove
  // ──────────────────────────────────────────────────
  describe('remove', () => {
    it('should set status to inactive and log audit', async () => {
      prisma.service.findFirst.mockResolvedValue(mockService);
      prisma.service.update.mockResolvedValue({
        ...mockService,
        status: 'inactive',
      });

      const result = await service.remove(clinicId, mockService.id, userId);

      expect(result).toEqual({ message: 'Service deactivated successfully' });
      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: mockService.id },
        data: { status: 'inactive' },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'DELETE',
        entity: 'Service',
        entityId: mockService.id,
        clinicId,
        userId,
        oldValues: { status: mockService.status },
        newValues: { status: 'inactive' },
      });
    });

    it('should throw NotFoundException if service does not exist', async () => {
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(clinicId, 'non-existent-id', userId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.service.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });
});
