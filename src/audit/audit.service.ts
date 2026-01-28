import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface AuditLogParams {
  action: string;
  entity: string;
  entityId?: string;
  clinicId?: string | null;
  userId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: params.action,
          entity: params.entity,
          entity_id: params.entityId,
          clinic_id: params.clinicId || null,
          user_id: params.userId || null,
          old_values: this.toJsonValue(params.oldValues),
          new_values: this.toJsonValue(params.newValues),
          ip_address: params.ipAddress,
          user_agent: params.userAgent,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error}`);
    }
  }

  async getLogsForClinic(clinicId: string, options?: { limit?: number; offset?: number }) {
    return this.prisma.auditLog.findMany({
      where: { clinic_id: clinicId },
      orderBy: { created_at: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async getLogsForEntity(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entity, entity_id: entityId },
      orderBy: { created_at: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
}
