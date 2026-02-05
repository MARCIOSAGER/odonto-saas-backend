import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_FIELDS = [
  'password',
  'smtp_pass',
  'z_api_token',
  'z_api_client_token',
  'ai_api_key',
  'totp_secret',
  'cpf',
  'phone',
  'email',
  'address',
  'allergies',
  'medications',
  'conditions',
  'content',
];

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

  private sanitize(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object') return value;
    const obj = JSON.parse(JSON.stringify(value));
    for (const key of Object.keys(obj)) {
      if (SENSITIVE_FIELDS.includes(key)) {
        obj[key] = '[REDACTED]';
      }
    }
    return obj;
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
          old_values: this.sanitize(params.oldValues) as any,
          new_values: this.sanitize(params.newValues) as any,
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
