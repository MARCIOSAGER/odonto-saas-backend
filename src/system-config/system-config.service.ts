import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAllPublic(): Promise<Record<string, string>> {
    const configs = await this.prisma.systemConfig.findMany({
      where: { is_public: true },
      select: { key: true, value: true, type: true },
    });

    const result: Record<string, string> = {};
    for (const c of configs) {
      result[c.key] = c.value;
    }
    return result;
  }

  async findByCategory(category: string) {
    return this.prisma.systemConfig.findMany({
      where: { category },
      orderBy: { key: 'asc' },
    });
  }

  async findByKey(key: string) {
    return this.prisma.systemConfig.findUnique({ where: { key } });
  }

  async upsert(key: string, value: string, userId: string) {
    const existing = await this.findByKey(key);

    if (existing && !existing.is_editable) {
      throw new BadRequestException(`Config "${key}" is not editable`);
    }

    // Infer category from key prefix
    let category = 'general';
    let isPublic = false;
    if (key.startsWith('platform_')) {
      category = 'platform_branding';
      isPublic = true;
    } else if (key.startsWith('stripe_') || key.startsWith('asaas_') || key.startsWith('payment_')) {
      category = 'payment_gateway';
    } else if (key.startsWith('smtp_')) {
      category = 'smtp';
    }

    const config = await this.prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: {
        key,
        value,
        type: 'string',
        is_public: isPublic,
        is_editable: true,
        category,
      },
    });

    await this.auditService.log({
      action: existing ? 'UPDATE' : 'CREATE',
      entity: 'SystemConfig',
      entityId: config.id,
      userId,
      oldValues: existing ? { value: existing.value } : undefined,
      newValues: { key, value },
    });

    return config;
  }

  async bulkUpsert(configs: { key: string; value: string }[], userId: string) {
    const results = [];
    for (const { key, value } of configs) {
      results.push(await this.upsert(key, value, userId));
    }
    return results;
  }
}
