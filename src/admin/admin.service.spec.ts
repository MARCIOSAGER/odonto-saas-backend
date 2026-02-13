import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { RedisCacheService } from '../cache/cache.service';
import { SecurityAlertsService } from '../security-alerts/security-alerts.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };
  let emailService: { sendPasswordResetEmail: jest.Mock };
  let configService: { get: jest.Mock };
  let cacheService: { getOrSet: jest.Mock; invalidate: jest.Mock; invalidateMany: jest.Mock };

  const adminUserId = 'admin-uuid-1';

  const mockUser = {
    id: 'user-uuid-1',
    name: 'Test User',
    email: 'test@test.com',
    role: 'admin',
    status: 'active',
    clinic_id: 'clinic-uuid-1',
    password: '$2a$12$hashedpassword',
  };

  const mockClinic = {
    id: 'clinic-uuid-1',
    name: 'Clinica Test',
    status: 'active',
    cnpj: '12345678000100',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    emailService = { sendPasswordResetEmail: jest.fn().mockResolvedValue(true) };
    configService = { get: jest.fn().mockReturnValue('http://localhost:3000') };
    cacheService = {
      getOrSet: jest.fn((key, factory) => factory()),
      invalidate: jest.fn().mockResolvedValue(undefined),
      invalidateMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: EmailService, useValue: emailService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisCacheService, useValue: cacheService },
        {
          provide: SecurityAlertsService,
          useValue: {
            onLoginFailed: jest.fn().mockResolvedValue(undefined),
            onRoleChanged: jest.fn().mockResolvedValue(undefined),
            onSuspiciousActivity: jest.fn().mockResolvedValue(undefined),
            onRateLimitExceeded: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // getStats
  // ──────────────────────────────────────────────────
  describe('getStats', () => {
    it('should return platform statistics', async () => {
      prisma.clinic.count
        .mockResolvedValueOnce(10) // totalClinics
        .mockResolvedValueOnce(7); // activeClinics
      prisma.user.count
        .mockResolvedValueOnce(50) // totalUsers
        .mockResolvedValueOnce(40); // activeUsers

      const result = await service.getStats();

      expect(result).toEqual({
        total_clinics: 10,
        active_clinics: 7,
        inactive_clinics: 3,
        total_users: 50,
        active_users: 40,
      });

      expect(prisma.clinic.count).toHaveBeenCalledTimes(2);
      expect(prisma.user.count).toHaveBeenCalledTimes(2);
    });

    it('should call clinic.count with active filter for activeClinics', async () => {
      prisma.clinic.count.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
      prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);

      await service.getStats();

      expect(prisma.clinic.count).toHaveBeenNthCalledWith(1);
      expect(prisma.clinic.count).toHaveBeenNthCalledWith(2, { where: { status: 'active' } });
      expect(prisma.user.count).toHaveBeenNthCalledWith(1);
      expect(prisma.user.count).toHaveBeenNthCalledWith(2, { where: { status: 'active' } });
    });

    it('should return zero inactive_clinics when all clinics are active', async () => {
      prisma.clinic.count.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
      prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(10);

      const result = await service.getStats();

      expect(result.inactive_clinics).toBe(0);
    });

    it('should handle zero counts', async () => {
      prisma.clinic.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prisma.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await service.getStats();

      expect(result).toEqual({
        total_clinics: 0,
        active_clinics: 0,
        inactive_clinics: 0,
        total_users: 0,
        active_users: 0,
      });
    });
  });

  // ──────────────────────────────────────────────────
  // findAllUsers
  // ──────────────────────────────────────────────────
  describe('findAllUsers', () => {
    it('should return paginated users with default page and limit', async () => {
      const users = [mockUser];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAllUsers({});

      expect(result).toEqual({
        data: users,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 0,
          take: 20,
          orderBy: { created_at: 'desc' },
        }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({ where: {} });
    });

    it('should apply search filter with OR conditions on name and email', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAllUsers({ search: 'Test' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'Test', mode: 'insensitive' } },
              { email: { contains: 'Test', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should filter by role', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAllUsers({ role: 'admin' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'admin' }),
        }),
      );
    });

    it('should filter by status', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAllUsers({ status: 'active' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        }),
      );
    });

    it('should filter by clinic_id', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAllUsers({ clinic_id: 'clinic-uuid-1' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinic_id: 'clinic-uuid-1' }),
        }),
      );
    });

    it('should respect custom page and limit', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(100);

      const result = await service.findAllUsers({ page: 3, limit: 10 });

      expect(result.meta).toEqual({ total: 100, page: 3, limit: 10, totalPages: 10 });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });

    it('should cap limit at 100', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.findAllUsers({ limit: 500 });

      expect(result.meta.limit).toBe(100);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });

    it('should default page to 1 when invalid', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.findAllUsers({ page: -1 });

      expect(result.meta.page).toBe(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
    });

    it('should calculate totalPages correctly', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(45);

      const result = await service.findAllUsers({ page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
    });

    it('should combine multiple filters', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAllUsers({
        search: 'Test',
        role: 'admin',
        status: 'active',
        clinic_id: 'clinic-uuid-1',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'admin',
            status: 'active',
            clinic_id: 'clinic-uuid-1',
            OR: [
              { name: { contains: 'Test', mode: 'insensitive' } },
              { email: { contains: 'Test', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // findOneUser
  // ──────────────────────────────────────────────────
  describe('findOneUser', () => {
    it('should return a user by id', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOneUser(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: expect.objectContaining({
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
        }),
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOneUser('non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException with correct message', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOneUser('non-existent-id')).rejects.toThrow(
        'Usuário não encontrado',
      );
    });
  });

  // ──────────────────────────────────────────────────
  // updateUserStatus
  // ──────────────────────────────────────────────────
  describe('updateUserStatus', () => {
    it('should update user status and log audit', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const updatedUser = {
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        status: 'inactive',
      };
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserStatus(mockUser.id, 'inactive', adminUserId);

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { status: 'inactive' },
        select: { id: true, name: true, email: true, status: true },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE_STATUS',
        entity: 'User',
        entityId: mockUser.id,
        clinicId: mockUser.clinic_id,
        userId: adminUserId,
        oldValues: { status: mockUser.status },
        newValues: { status: 'inactive' },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserStatus('non-existent-id', 'inactive', adminUserId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when admin tries to change own status', async () => {
      const selfUser = { ...mockUser, id: adminUserId };
      prisma.user.findUnique.mockResolvedValue(selfUser);

      await expect(service.updateUserStatus(adminUserId, 'inactive', adminUserId)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.updateUserStatus(adminUserId, 'inactive', adminUserId)).rejects.toThrow(
        'Você não pode alterar seu próprio status',
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // updateUserRole
  // ──────────────────────────────────────────────────
  describe('updateUserRole', () => {
    it('should update user role and log audit', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      const updatedUser = {
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        role: 'superadmin',
      };
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateUserRole(mockUser.id, 'superadmin', adminUserId);

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { role: 'superadmin' },
        select: { id: true, name: true, email: true, role: true },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE_ROLE',
        entity: 'User',
        entityId: mockUser.id,
        clinicId: mockUser.clinic_id,
        userId: adminUserId,
        oldValues: { role: mockUser.role },
        newValues: { role: 'superadmin' },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserRole('non-existent-id', 'superadmin', adminUserId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when admin tries to change own role', async () => {
      const selfUser = { ...mockUser, id: adminUserId };
      prisma.user.findUnique.mockResolvedValue(selfUser);

      await expect(service.updateUserRole(adminUserId, 'superadmin', adminUserId)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.updateUserRole(adminUserId, 'superadmin', adminUserId)).rejects.toThrow(
        'Você não pode alterar seu próprio role',
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // resetUserPassword
  // ──────────────────────────────────────────────────
  describe('resetUserPassword', () => {
    it('should generate reset token, send email, and log audit', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.resetUserPassword(mockUser.id, adminUserId);

      expect(result).toEqual({ message: 'Email de redefinição de senha enviado' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          reset_token: expect.any(String),
          reset_token_expires: expect.any(Date),
        },
      });

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.name,
        expect.stringContaining('http://localhost:3000/forgot-password/reset?token='),
        mockUser.clinic_id,
      );

      expect(auditService.log).toHaveBeenCalledWith({
        action: 'ADMIN_RESET_PASSWORD',
        entity: 'User',
        entityId: mockUser.id,
        clinicId: mockUser.clinic_id,
        userId: adminUserId,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetUserPassword('non-existent-id', adminUserId)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should use FRONTEND_URL from configService for reset link', async () => {
      configService.get.mockReturnValue('https://app.odonto.com');
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      await service.resetUserPassword(mockUser.id, adminUserId);

      expect(configService.get).toHaveBeenCalledWith('FRONTEND_URL', 'http://localhost:3000');
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.name,
        expect.stringContaining('https://app.odonto.com/forgot-password/reset?token='),
        mockUser.clinic_id,
      );
    });

    it('should set reset_token_expires to approximately 1 hour from now', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const before = Date.now();
      await service.resetUserPassword(mockUser.id, adminUserId);
      const after = Date.now();

      const updateCall = prisma.user.update.mock.calls[0][0];
      const expiresTime = updateCall.data.reset_token_expires.getTime();
      const oneHourMs = 60 * 60 * 1000;

      expect(expiresTime).toBeGreaterThanOrEqual(before + oneHourMs);
      expect(expiresTime).toBeLessThanOrEqual(after + oneHourMs);
    });

    it('should pass undefined for clinic_id when user has no clinic', async () => {
      const userWithoutClinic = { ...mockUser, clinic_id: null };
      prisma.user.findUnique.mockResolvedValue(userWithoutClinic);
      prisma.user.update.mockResolvedValue(userWithoutClinic);

      await service.resetUserPassword(userWithoutClinic.id, adminUserId);

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        userWithoutClinic.email,
        userWithoutClinic.name,
        expect.any(String),
        undefined,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // findAllClinics
  // ──────────────────────────────────────────────────
  describe('findAllClinics', () => {
    it('should return paginated clinics with default page and limit', async () => {
      const clinics = [mockClinic];
      prisma.clinic.findMany.mockResolvedValue(clinics);
      prisma.clinic.count.mockResolvedValue(1);

      const result = await service.findAllClinics({});

      expect(result).toEqual({
        data: clinics,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });

      expect(prisma.clinic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          skip: 0,
          take: 20,
          orderBy: { created_at: 'desc' },
          select: expect.objectContaining({
            _count: {
              select: {
                patients: true,
                dentists: true,
                appointments: true,
                users: true,
              },
            },
          }),
        }),
      );
    });

    it('should filter by status', async () => {
      prisma.clinic.findMany.mockResolvedValue([]);
      prisma.clinic.count.mockResolvedValue(0);

      await service.findAllClinics({ status: 'active' });

      expect(prisma.clinic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        }),
      );
    });

    it('should apply search filter matching name or cnpj', async () => {
      prisma.clinic.findMany.mockResolvedValue([]);
      prisma.clinic.count.mockResolvedValue(0);

      await service.findAllClinics({ search: 'Clinica' });

      expect(prisma.clinic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'Clinica', mode: 'insensitive' } },
              { cnpj: { contains: 'Clinica' } },
            ],
          }),
        }),
      );
    });

    it('should respect custom page and limit', async () => {
      prisma.clinic.findMany.mockResolvedValue([]);
      prisma.clinic.count.mockResolvedValue(50);

      const result = await service.findAllClinics({ page: 2, limit: 10 });

      expect(result.meta).toEqual({ total: 50, page: 2, limit: 10, totalPages: 5 });
      expect(prisma.clinic.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should cap limit at 100', async () => {
      prisma.clinic.findMany.mockResolvedValue([]);
      prisma.clinic.count.mockResolvedValue(0);

      const result = await service.findAllClinics({ limit: 200 });

      expect(result.meta.limit).toBe(100);
      expect(prisma.clinic.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });

    it('should calculate totalPages correctly', async () => {
      prisma.clinic.findMany.mockResolvedValue([]);
      prisma.clinic.count.mockResolvedValue(55);

      const result = await service.findAllClinics({ page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
    });
  });

  // ──────────────────────────────────────────────────
  // updateClinicStatus
  // ──────────────────────────────────────────────────
  describe('updateClinicStatus', () => {
    it('should update clinic status and log audit', async () => {
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);
      const updatedClinic = { id: mockClinic.id, name: mockClinic.name, status: 'inactive' };
      prisma.clinic.update.mockResolvedValue(updatedClinic);

      const result = await service.updateClinicStatus(mockClinic.id, 'inactive', adminUserId);

      expect(result).toEqual(updatedClinic);
      expect(prisma.clinic.update).toHaveBeenCalledWith({
        where: { id: mockClinic.id },
        data: { status: 'inactive' },
        select: { id: true, name: true, status: true },
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: 'UPDATE_STATUS',
        entity: 'Clinic',
        entityId: mockClinic.id,
        clinicId: mockClinic.id,
        userId: adminUserId,
        oldValues: { status: mockClinic.status },
        newValues: { status: 'inactive' },
      });
    });

    it('should throw NotFoundException when clinic not found', async () => {
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(
        service.updateClinicStatus('non-existent-id', 'inactive', adminUserId),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.clinic.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException with correct message', async () => {
      prisma.clinic.findUnique.mockResolvedValue(null);

      await expect(
        service.updateClinicStatus('non-existent-id', 'inactive', adminUserId),
      ).rejects.toThrow('Clínica não encontrada');
    });
  });
});
