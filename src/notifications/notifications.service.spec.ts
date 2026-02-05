import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../cache/cache.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let cacheService: { getOrSet: jest.Mock; invalidate: jest.Mock; invalidateMany: jest.Mock };

  const userId = 'user-uuid-1';
  const clinicId = 'clinic-uuid-1';
  const mockNotification = {
    id: 'notif-uuid-1',
    user_id: userId,
    clinic_id: clinicId,
    type: 'appointment',
    title: 'Nova consulta',
    body: 'Consulta agendada para amanha',
    data: null,
    read: false,
    created_at: new Date('2025-01-01'),
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    cacheService = {
      getOrSet: jest.fn((key, factory) => factory()),
      invalidate: jest.fn().mockResolvedValue(undefined),
      invalidateMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisCacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    it('should create a notification with all fields', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification);

      const params = {
        user_id: userId,
        clinic_id: clinicId,
        type: 'appointment',
        title: 'Nova consulta',
        body: 'Consulta agendada para amanha',
      };

      const result = await service.create(params);

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          user_id: userId,
          clinic_id: clinicId,
          type: 'appointment',
          title: 'Nova consulta',
          body: 'Consulta agendada para amanha',
          data: null,
        },
      });
    });

    it('should set clinic_id to null when not provided', async () => {
      const notifWithoutClinic = { ...mockNotification, clinic_id: null };
      prisma.notification.create.mockResolvedValue(notifWithoutClinic);

      const params = {
        user_id: userId,
        type: 'system',
        title: 'Aviso do sistema',
        body: 'Manutencao programada',
      };

      await service.create(params);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinic_id: null,
        }),
      });
    });

    it('should pass data as JSON when provided', async () => {
      const extraData = { appointment_id: 'apt-123', dentist: 'Dr. Silva' };
      const notifWithData = { ...mockNotification, data: extraData };
      prisma.notification.create.mockResolvedValue(notifWithData);

      const params = {
        user_id: userId,
        clinic_id: clinicId,
        type: 'appointment',
        title: 'Nova consulta',
        body: 'Consulta agendada para amanha',
        data: extraData,
      };

      const result = await service.create(params);

      expect(result).toEqual(notifWithData);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: extraData,
        }),
      });
    });

    it('should set data to null when not provided', async () => {
      prisma.notification.create.mockResolvedValue(mockNotification);

      const params = {
        user_id: userId,
        clinic_id: clinicId,
        type: 'appointment',
        title: 'Nova consulta',
        body: 'Consulta agendada para amanha',
      };

      await service.create(params);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: null,
        }),
      });
    });
  });

  // ──────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated notifications with default page and limit', async () => {
      const notifications = [mockNotification];
      prisma.notification.findMany.mockResolvedValue(notifications);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.findAll(userId);

      expect(result).toEqual({
        data: notifications,
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { user_id: userId },
      });
    });

    it('should apply custom page and limit', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(50);

      const result = await service.findAll(userId, 3, 10);

      expect(result).toEqual({
        data: [],
        meta: { total: 50, page: 3, limit: 10, totalPages: 5 },
      });
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip: 20,
        take: 10,
      });
    });

    it('should cap limit at 100', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      const result = await service.findAll(userId, 1, 500);

      expect(result.meta.limit).toBe(100);
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('should calculate totalPages correctly', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(55);

      const result = await service.findAll(userId, 1, 20);

      expect(result.meta.totalPages).toBe(3); // Math.ceil(55 / 20) = 3
    });

    it('should return empty data when no notifications exist', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      const result = await service.findAll(userId);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────
  // getUnreadCount
  // ──────────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('should return the count of unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(userId);

      expect(result).toEqual({ count: 5 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { user_id: userId, read: false },
      });
    });

    it('should return zero when all notifications are read', async () => {
      prisma.notification.count.mockResolvedValue(0);

      const result = await service.getUnreadCount(userId);

      expect(result).toEqual({ count: 0 });
    });
  });

  // ──────────────────────────────────────────────────
  // markAsRead
  // ──────────────────────────────────────────────────
  describe('markAsRead', () => {
    it('should mark a specific notification as read', async () => {
      const updateResult = { count: 1 };
      prisma.notification.updateMany.mockResolvedValue(updateResult);

      const notificationId = 'notif-uuid-1';
      const result = await service.markAsRead(userId, notificationId);

      expect(result).toEqual(updateResult);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: notificationId, user_id: userId },
        data: { read: true },
      });
    });

    it('should return count 0 when notification does not belong to user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAsRead(userId, 'other-notif-id');

      expect(result).toEqual({ count: 0 });
    });
  });

  // ──────────────────────────────────────────────────
  // markAllAsRead
  // ──────────────────────────────────────────────────
  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read for a user', async () => {
      const updateResult = { count: 3 };
      prisma.notification.updateMany.mockResolvedValue(updateResult);

      const result = await service.markAllAsRead(userId);

      expect(result).toEqual(updateResult);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { user_id: userId, read: false },
        data: { read: true },
      });
    });

    it('should return count 0 when no unread notifications exist', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllAsRead(userId);

      expect(result).toEqual({ count: 0 });
    });
  });

  // ──────────────────────────────────────────────────
  // notifyClinic
  // ──────────────────────────────────────────────────
  describe('notifyClinic', () => {
    it('should create a notification for each active user in the clinic', async () => {
      const users = [{ id: 'user-uuid-1' }, { id: 'user-uuid-2' }, { id: 'user-uuid-3' }];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.notification.create
        .mockResolvedValueOnce({ ...mockNotification, id: 'notif-1', user_id: 'user-uuid-1' })
        .mockResolvedValueOnce({ ...mockNotification, id: 'notif-2', user_id: 'user-uuid-2' })
        .mockResolvedValueOnce({ ...mockNotification, id: 'notif-3', user_id: 'user-uuid-3' });

      const result = await service.notifyClinic(
        clinicId,
        'system',
        'Aviso',
        'Manutencao programada',
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { clinic_id: clinicId, status: 'active' },
        select: { id: true },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);

      // Verify each user got their own notification
      users.forEach((user) => {
        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: {
            user_id: user.id,
            clinic_id: clinicId,
            type: 'system',
            title: 'Aviso',
            body: 'Manutencao programada',
            data: null,
          },
        });
      });
    });

    it('should pass extra data to each notification when provided', async () => {
      const users = [{ id: 'user-uuid-1' }];
      prisma.user.findMany.mockResolvedValue(users);
      prisma.notification.create.mockResolvedValue(mockNotification);

      const extraData = { action: 'maintenance', duration: '2h' };
      await service.notifyClinic(clinicId, 'system', 'Aviso', 'Manutencao programada', extraData);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: extraData,
        }),
      });
    });

    it('should return empty array when clinic has no active users', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.notifyClinic(clinicId, 'system', 'Aviso', 'Sem usuarios ativos');

      expect(result).toEqual([]);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
