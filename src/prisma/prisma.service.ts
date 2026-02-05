import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { EncryptionService } from '../common/encryption/encryption.service';
import {
  getEncryptedFieldsForModel,
  EncryptedFieldConfig,
} from '../common/encryption/encryption.config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    @Optional() @Inject(EncryptionService) private readonly encryption?: EncryptionService,
  ) {
    const databaseUrl = process.env.DATABASE_URL || '';
    const hasParams = databaseUrl.includes('?');
    const poolParams = 'connection_limit=10&pool_timeout=30';

    super({
      ...(databaseUrl
        ? { datasourceUrl: `${databaseUrl}${hasParams ? '&' : '?'}${poolParams}` }
        : {}),
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');

    // Register query performance monitoring
    this.registerQueryPerformanceMonitoring();

    if (this.encryption?.isEnabled) {
      this.registerEncryptionMiddleware();
      this.logger.log('Encryption middleware registered');
    } else {
      this.logger.warn('Encryption middleware NOT registered (ENCRYPTION_KEY not set)');
    }
  }

  private registerQueryPerformanceMonitoring() {
    const SLOW_QUERY_THRESHOLD = 1000; // 1 second
    const VERY_SLOW_QUERY_THRESHOLD = 3000; // 3 seconds

    (this.$on as any)('query', (e: any) => {
      const duration = e.duration;

      if (duration >= VERY_SLOW_QUERY_THRESHOLD) {
        this.logger.error(
          `VERY SLOW QUERY (${duration}ms): ${JSON.stringify({
            query: e.query.substring(0, 200),
            params: e.params,
            duration: `${duration}ms`,
            target: e.target,
          })}`,
        );
      } else if (duration >= SLOW_QUERY_THRESHOLD) {
        this.logger.warn(
          `Slow Query (${duration}ms): ${JSON.stringify({
            query: e.query.substring(0, 200),
            params: e.params,
            duration: `${duration}ms`,
            target: e.target,
          })}`,
        );
      }
    });

    this.logger.log('Query performance monitoring enabled (threshold: 1s)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  private registerEncryptionMiddleware() {
    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      const modelName = params.model;
      if (!modelName) return next(params);

      const fields = getEncryptedFieldsForModel(modelName);
      if (!fields || fields.length === 0) return next(params);

      // Encrypt on write
      if (['create', 'update', 'upsert', 'createMany', 'updateMany'].includes(params.action)) {
        this.encryptParams(params, fields);
      }

      const result = await next(params);

      // Decrypt on read
      if (result) {
        this.decryptResult(result, fields);
      }

      return result;
    });
  }

  private encryptParams(params: Prisma.MiddlewareParams, fields: EncryptedFieldConfig[]) {
    const data =
      params.action === 'upsert' ? params.args?.create || params.args?.update : params.args?.data;

    if (!data) return;

    if (params.action === 'upsert') {
      if (params.args?.create) this.encryptData(params.args.create, fields);
      if (params.args?.update) this.encryptData(params.args.update, fields);
    } else if (params.action === 'createMany' && Array.isArray(data)) {
      data.forEach((item: Record<string, unknown>) => this.encryptData(item, fields));
    } else {
      this.encryptData(data, fields);
    }
  }

  private encryptData(data: Record<string, unknown>, fields: EncryptedFieldConfig[]) {
    for (const fieldConfig of fields) {
      const value = data[fieldConfig.field];
      if (value === null || value === undefined) continue;

      if (typeof value === 'string' && this.encryption!.isEncrypted(value)) continue;

      if (fieldConfig.type === 'string') {
        data[fieldConfig.field] = this.encryption!.encrypt(value as string);
      } else if (fieldConfig.type === 'json' || fieldConfig.type === 'string[]') {
        data[fieldConfig.field] = this.encryption!.encryptJson(value);
      }

      if (fieldConfig.blindIndex) {
        let normalized: string;
        if (fieldConfig.hashNormalize === 'lowercase') {
          normalized = String(value).trim().toLowerCase();
        } else {
          normalized = String(value).replace(/\D/g, '');
        }
        data[fieldConfig.blindIndex] = this.encryption!.hmac(normalized);
      }
    }
  }

  private decryptResult(result: unknown, fields: EncryptedFieldConfig[]) {
    if (Array.isArray(result)) {
      result.forEach((item) => this.decryptRecord(item, fields));
    } else if (result && typeof result === 'object') {
      this.decryptRecord(result as Record<string, unknown>, fields);
    }
  }

  private decryptRecord(record: Record<string, unknown>, fields: EncryptedFieldConfig[]) {
    if (!record || typeof record !== 'object') return;

    for (const fieldConfig of fields) {
      const value = record[fieldConfig.field];
      if (value === null || value === undefined || typeof value !== 'string') continue;

      if (!this.encryption!.isEncrypted(value)) continue;

      if (fieldConfig.type === 'string') {
        record[fieldConfig.field] = this.encryption!.decrypt(value);
      } else if (fieldConfig.type === 'json' || fieldConfig.type === 'string[]') {
        record[fieldConfig.field] = this.encryption!.decryptJson(value);
      }
    }
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase is not allowed in production');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && !key.startsWith('_') && !key.startsWith('$'),
    );

    return Promise.all(
      models.map((modelKey) => {
        const model = this[modelKey as keyof this];
        if (model && typeof model === 'object' && 'deleteMany' in model) {
          return (model as { deleteMany: () => Promise<unknown> }).deleteMany();
        }
        return Promise.resolve();
      }),
    );
  }
}
