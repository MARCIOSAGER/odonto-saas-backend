import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailProcessor } from './processors/email.processor';
import { QueueService } from './queue.service';
import { QUEUE_EMAIL, QUEUE_WHATSAPP, QUEUE_PDF } from './queue.constants';
import { EmailModule } from '../email/email.module';

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
    BullModule.registerQueue({ name: QUEUE_EMAIL }, { name: QUEUE_WHATSAPP }, { name: QUEUE_PDF }),
    EmailModule,
  ],
  providers: [QueueService, EmailProcessor],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
