import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClinicsService } from './clinics.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../cache/cache.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('ClinicsService', () => {
  let service: ClinicsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };
  let configService: { get: jest.Mock };
  let cacheService: { getOrSet: jest.Mock; invalidate: jest.Mock; invalidateMany: jest.Mock };

  const userId = 'user-uuid-1';

  const mockClinic = {
    id: 'clinic-uuid-1',
    name: 'Clinica Sorriso',
    cnpj: '12345678000100',
    phone: '1133334444',
    email: 'contato@clinicasorriso.com.br',
    address: 'Rua das Flores, 100',
    city: 'Sao Paulo',
    state: 'SP',
    plan: 'professional',
    status: 'active',
    slug: 'clinica-sorriso',
    logo_url: null,
    favicon_url: null,
    logo_display_mode: null,
    primary_color: '#0EA5E9',
    secondary_color: null,
    slogan: null,
    tagline: null,
    z_api_instance: null,
    z_api_token: null,
    z_api_client_token: null,
    smtp_host: null,
    smtp_port: null,
    smtp_user: null,
    smtp_pass: null,
    smtp_from: null,
    smtp_secure: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    _count: { patients: 50, appointments: 200, dentists: 5, services: 15 },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    configService = { get: jest.fn().mockReturnValue('') };
    cacheService = {
      getOrSet: jest.fn((key, factory) => factory()),
      invalidate: jest.fn().mockResolvedValue(undefined),
      invalidateMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisCacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<ClinicsService>(ClinicsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return a paginated list of clinics', async () => {
      const clinics = [mockClinic];
      prisma.clinic.findMany.mockResolvedValue(clinics);
      prisma.clinic.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({
        data: clinics,
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });
      expect(prisma.clinic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 0,
          take: 10,
          orderBy: { created_at: 'desc' },
          select: expect.objectContaining({
            _count: {
              select: {
                patients: true,
                appointments: true,
                dentists: true,
              },
            },
          }),
        }),
      );
    });

    it('should filter by status when provided', async () => {
      prisma.clinic.findMany.mockResolvedValue([]);
      prisma.clinic.count.mockResolvedValue(0);

      await service.findAll({ status: 'active' });

      expect(prisma.clinic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'active' },
        }),
      );
    });

    it('should use default page and limit when not provided', async () => {
      prisma.clinic.findMany.mockResolvedValue([]);
      prisma.clinic.count.mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  // ──────────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a clinic by id', async () => {
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);

      const result = await service.findOne(mockClinic.id);

      expect(result).toEqual(mockClinic);
      expect(prisma.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: mockClinic.id },
        select: expect.objectContaining({
          _count: {
            select: {
              patients: true,
              appointments: true,
              dentists: true,
              services: true,
            },
          },
        }),
      });
    });

    it('should throw NotFoundException when clinic not found', async () => {
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      name: 'Nova Clinica',
      cnpj: '98765432000199',
      phone: '1144445555',
      email: 'nova@clinica.com',
      address: 'Av. Paulista, 1000',
      city: 'Sao Paulo',
      state: 'SP',
      plan: 'basic',
    };

    it('should create a clinic and log audit', async () => {
      // findByCnpj returns null (no duplicate)
      prisma.clinic.findUnique.mockResolvedValue(null);
      const createdClinic = {
        id: 'new-clinic-uuid',
        ...createDto,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };
      prisma.clinic.create.mockResolvedValue(createdClinic);

      const result = await service.create(createDto as any, userId);

      expect(result).toEqual(createdClinic);
      expect(prisma.clinic.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          cnpj: createDto.cnpj,
          phone: createDto.phone,
          email: createDto.email,
          address: createDto.address,
          city: createDto.city,
          state: createDto.state,
          plan: createDto.plan,
          status: 'active',
        },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'CREATE',
        entity: 'Clinic',
        entityId: createdClinic.id,
        clinicId: createdClinic.id,
        userId,
        newValues: createDto,
      });
    });

    it('should throw ConflictException if CNPJ already exists', async () => {
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);

      await expect(service.create(createDto as any, userId)).rejects.toThrow(ConflictException);

      expect(prisma.clinic.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────
  describe('update', () => {
    const updateDto = {
      name: 'Clinica Sorriso Atualizada',
      phone: '1155556666',
    };

    it('should update a clinic and log audit', async () => {
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);
      const updatedClinic = { ...mockClinic, ...updateDto };
      prisma.clinic.update.mockResolvedValue(updatedClinic);

      const result = await service.update(mockClinic.id, updateDto as any, userId);

      expect(result.name).toBe(updateDto.name);
      expect(prisma.clinic.update).toHaveBeenCalledWith({
        where: { id: mockClinic.id },
        data: updateDto,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entity: 'Clinic',
          entityId: mockClinic.id,
          clinicId: mockClinic.id,
          userId,
        }),
      );
    });

    it('should throw NotFoundException if clinic does not exist', async () => {
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent-id', updateDto as any, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if new CNPJ already exists on another clinic', async () => {
      const updateWithCnpj = { cnpj: '11111111000111' };
      prisma.clinic.findUnique
        .mockResolvedValueOnce(mockClinic) // findOne succeeds
        .mockResolvedValueOnce({ id: 'another-clinic', cnpj: '11111111000111' }); // findByCnpj finds duplicate

      await expect(service.update(mockClinic.id, updateWithCnpj as any, userId)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.clinic.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // getStats
  // ──────────────────────────────────────────────────
  describe('getStats', () => {
    it('should return clinic statistics', async () => {
      prisma.patient.count.mockResolvedValue(50);
      prisma.appointment.count
        .mockResolvedValueOnce(5) // appointmentsToday
        .mockResolvedValueOnce(12); // appointmentsPending
      prisma.appointment.findMany.mockResolvedValue([
        { service: { price: 150 } },
        { service: { price: 300 } },
        { service: { price: 200 } },
      ]);

      const result = await service.getStats(mockClinic.id);

      expect(result).toEqual({
        total_patients: 50,
        appointments_today: 5,
        appointments_pending: 12,
        revenue_month: 650,
      });
      expect(prisma.patient.count).toHaveBeenCalledWith({
        where: { clinic_id: mockClinic.id, status: 'active' },
      });
    });

    it('should return zero revenue when no completed appointments', async () => {
      prisma.patient.count.mockResolvedValue(0);
      prisma.appointment.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.appointment.findMany.mockResolvedValue([]);

      const result = await service.getStats(mockClinic.id);

      expect(result.revenue_month).toBe(0);
      expect(result.total_patients).toBe(0);
    });

    it('should handle appointments with missing service price gracefully', async () => {
      prisma.patient.count.mockResolvedValue(10);
      prisma.appointment.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
      prisma.appointment.findMany.mockResolvedValue([
        { service: { price: 100 } },
        { service: null },
        { service: { price: null } },
      ]);

      const result = await service.getStats(mockClinic.id);

      expect(result.revenue_month).toBe(100);
    });
  });
});
