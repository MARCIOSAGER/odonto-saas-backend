import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { createPrismaMock } from '../test/prisma-mock';

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };
  let encryptionService: { hmac: jest.Mock; isEnabled: boolean };

  const clinicId = 'clinic-uuid-1';
  const userId = 'user-uuid-1';

  const mockPatient = {
    id: 'patient-uuid-1',
    clinic_id: clinicId,
    name: 'Maria Silva',
    phone: '11999999999',
    cpf: '12345678900',
    email: 'maria@example.com',
    birth_date: new Date('1990-05-15'),
    address: 'Rua Exemplo, 123',
    notes: null,
    status: 'active',
    deleted_at: null,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
    last_visit: null,
    _count: { appointments: 3 },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    encryptionService = {
      hmac: jest.fn((value: string) => `hmac_${value}`),
      isEnabled: true,
    };

    const notificationsService = {
      create: jest.fn().mockResolvedValue({}),
      notifyClinic: jest.fn().mockResolvedValue([]),
    };
    const notificationsGateway = { sendToUser: jest.fn(), sendUnreadCount: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated patients with deleted_at: null filter', async () => {
      const patients = [mockPatient];
      prisma.patient.findMany.mockResolvedValue(patients);
      prisma.patient.count.mockResolvedValue(1);

      const result = await service.findAll(clinicId, { page: 1, limit: 10 });

      expect(result).toEqual({
        data: patients,
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinic_id: clinicId,
            deleted_at: null,
          }),
          skip: 0,
          take: 10,
          orderBy: { created_at: 'desc' },
        }),
      );
      expect(prisma.patient.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          clinic_id: clinicId,
          deleted_at: null,
        }),
      });
    });

    it('should apply search filter with name-only for text search', async () => {
      prisma.patient.findMany.mockResolvedValue([]);
      prisma.patient.count.mockResolvedValue(0);

      await service.findAll(clinicId, { search: 'Maria' });

      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ name: { contains: 'Maria', mode: 'insensitive' } }],
          }),
        }),
      );
    });

    it('should search by phone/cpf hash when digits are provided', async () => {
      prisma.patient.findMany.mockResolvedValue([]);
      prisma.patient.count.mockResolvedValue(0);

      await service.findAll(clinicId, { search: '11999999999' });

      expect(encryptionService.hmac).toHaveBeenCalledWith('11999999999');
      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: '11999999999', mode: 'insensitive' } },
              { phone_hash: 'hmac_11999999999' },
              { cpf_hash: 'hmac_11999999999' },
            ]),
          }),
        }),
      );
    });

    it('should search by email hash when @ is present', async () => {
      prisma.patient.findMany.mockResolvedValue([]);
      prisma.patient.count.mockResolvedValue(0);

      await service.findAll(clinicId, { search: 'maria@example.com' });

      expect(encryptionService.hmac).toHaveBeenCalledWith('maria@example.com');
      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ email_hash: 'hmac_maria@example.com' }]),
          }),
        }),
      );
    });

    it('should apply status filter', async () => {
      prisma.patient.findMany.mockResolvedValue([]);
      prisma.patient.count.mockResolvedValue(0);

      await service.findAll(clinicId, { status: 'active' });

      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'active',
          }),
        }),
      );
    });

    it('should calculate totalPages correctly', async () => {
      prisma.patient.findMany.mockResolvedValue([]);
      prisma.patient.count.mockResolvedValue(25);

      const result = await service.findAll(clinicId, { page: 1, limit: 10 });

      expect(result.meta.totalPages).toBe(3);
    });
  });

  // ──────────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return a patient by id', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);

      const result = await service.findOne(clinicId, mockPatient.id);

      expect(result).toEqual(mockPatient);
      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: mockPatient.id, clinic_id: clinicId, deleted_at: null },
        include: { _count: { select: { appointments: true } } },
      });
    });

    it('should throw NotFoundException when patient not found', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.findOne(clinicId, 'non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      name: 'Joao Santos',
      phone: '(11) 98888-7777',
      cpf: '98765432100',
      email: 'joao@example.com',
      birth_date: '1985-03-20',
      address: 'Av. Brasil, 456',
      notes: 'Paciente novo',
    };

    it('should create a patient and log audit', async () => {
      prisma.patient.findFirst.mockResolvedValue(null); // no duplicate
      const createdPatient = {
        id: 'new-patient-uuid',
        clinic_id: clinicId,
        ...createDto,
        phone: '11988887777',
        birth_date: new Date('1985-03-20T00:00:00.000Z'),
        status: 'active',
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      prisma.patient.create.mockResolvedValue(createdPatient);

      const result = await service.create(clinicId, createDto as any, userId);

      expect(result).toEqual(createdPatient);
      expect(encryptionService.hmac).toHaveBeenCalledWith('11988887777');
      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: {
          clinic_id: clinicId,
          phone_hash: 'hmac_11988887777',
          deleted_at: null,
        },
      });
      expect(prisma.patient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinic_id: clinicId,
          name: createDto.name,
          phone: '11988887777',
          status: 'active',
        }),
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'CREATE',
        entity: 'Patient',
        entityId: createdPatient.id,
        clinicId,
        userId,
        newValues: createDto,
      });
    });

    it('should throw ConflictException on duplicate phone', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient); // existing patient

      await expect(service.create(clinicId, createDto as any, userId)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.patient.create).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // remove (soft delete)
  // ──────────────────────────────────────────────────
  describe('remove', () => {
    it('should set deleted_at and status to inactive', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      const deletedPatient = {
        ...mockPatient,
        status: 'inactive',
        deleted_at: new Date('2025-06-01'),
      };
      prisma.patient.update.mockResolvedValue(deletedPatient);

      const result = await service.remove(clinicId, mockPatient.id, userId);

      expect(result.status).toBe('inactive');
      expect(result.deleted_at).toBeDefined();
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: mockPatient.id },
        data: { status: 'inactive', deleted_at: expect.any(Date) },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entity: 'Patient',
          entityId: mockPatient.id,
          clinicId,
          userId,
        }),
      );
    });

    it('should throw NotFoundException if patient does not exist', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.remove(clinicId, 'non-existent-id', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // restore
  // ──────────────────────────────────────────────────
  describe('restore', () => {
    it('should restore a soft-deleted patient', async () => {
      const deletedPatient = {
        ...mockPatient,
        status: 'inactive',
        deleted_at: new Date('2025-06-01'),
      };
      prisma.patient.findFirst.mockResolvedValue(deletedPatient);
      const restoredPatient = {
        ...mockPatient,
        status: 'active',
        deleted_at: null,
      };
      prisma.patient.update.mockResolvedValue(restoredPatient);

      const result = await service.restore(clinicId, mockPatient.id, userId);

      expect(result.status).toBe('active');
      expect(result.deleted_at).toBeNull();
      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockPatient.id,
          clinic_id: clinicId,
          deleted_at: { not: null },
        },
      });
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: mockPatient.id },
        data: { status: 'active', deleted_at: null },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RESTORE',
          entity: 'Patient',
          entityId: mockPatient.id,
        }),
      );
    });

    it('should throw NotFoundException when patient not found or not deleted', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.restore(clinicId, 'non-existent-id', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
