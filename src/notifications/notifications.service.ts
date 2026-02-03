import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../cache/cache.service';

export interface CreateNotificationParams {
  user_id: string;
  clinic_id?: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: RedisCacheService,
  ) {}

  async create(params: CreateNotificationParams) {
    const notification = await this.prisma.notification.create({
      data: {
        user_id: params.user_id,
        clinic_id: params.clinic_id || null,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data ? (params.data as any) : null,
      },
    });

    await this.cacheService.invalidate(`notifications:count:${params.user_id}`);
    return notification;
  }

  async findAll(userId: string, page = 1, limit = 20, cursor?: string) {
    const take = Math.min(limit, 100);
    const where = { user_id: userId };

    // Cursor-based pagination
    if (cursor) {
      const notifications = await this.prisma.notification.findMany({
        where,
        cursor: { id: cursor },
        skip: 1,
        take: take + 1,
        orderBy: { created_at: 'desc' },
      });

      const hasMore = notifications.length > take;
      const data = hasMore ? notifications.slice(0, take) : notifications;

      return {
        data,
        meta: {
          hasMore,
          nextCursor: data.length > 0 ? data[data.length - 1].id : null,
          limit: take,
        },
      };
    }

    // Offset-based pagination (default)
    const skip = (page - 1) * take;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  async getUnreadCount(userId: string) {
    return this.cacheService.getOrSet(
      `notifications:count:${userId}`,
      async () => {
        const count = await this.prisma.notification.count({
          where: { user_id: userId, read: false },
        });
        return { count };
      },
      15 * 1000, // 15 seconds
    );
  }

  async markAsRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { read: true },
    });

    await this.cacheService.invalidate(`notifications:count:${userId}`);
    return result;
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { user_id: userId, read: false },
      data: { read: true },
    });

    await this.cacheService.invalidate(`notifications:count:${userId}`);
    return result;
  }

  /**
   * Send notification to all users of a clinic
   */
  async notifyClinic(
    clinicId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ) {
    const users = await this.prisma.user.findMany({
      where: { clinic_id: clinicId, status: 'active' },
      select: { id: true },
    });

    const notifications = await Promise.all(
      users.map((user) =>
        this.create({
          user_id: user.id,
          clinic_id: clinicId,
          type,
          title,
          body,
          data,
        }),
      ),
    );

    return notifications;
  }
}
