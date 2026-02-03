import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailProcessor } from './processors/email.processor';
import { QueueService } from './queue.service';

export const QUEUE_EMAIL = 'email';
export const QUEUE_WHATSAPP = 'whatsapp';
export const QUEUE_PDF = 'pdf';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST');
        if (!redisHost) {
          // When Redis is not configured, BullMQ will still try to connect
          // but QueueService.isEnabled will be false, so no jobs are enqueued
          return {
            connection: {
              host: 'localhost',
              port: 6379,
              lazyConnect: true,
              maxRetriesPerRequest: 0,
              enableOfflineQueue: false,
            },
          };
        }
        return {
          connection: {
            host: redisHost,
            port: configService.get('REDIS_PORT', 6379),
            password: configService.get('REDIS_PASSWORD') || undefined,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_EMAIL },
      { name: QUEUE_WHATSAPP },
      { name: QUEUE_PDF },
    ),
  ],
  providers: [QueueService, EmailProcessor],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
