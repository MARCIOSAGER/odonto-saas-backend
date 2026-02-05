import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailProcessor } from './processors/email.processor';
import { PdfProcessor } from './processors/pdf.processor';
import { QueueService } from './queue.service';
import { QUEUE_EMAIL, QUEUE_WHATSAPP, QUEUE_PDF } from './queue.constants';
import { EmailModule } from '../email/email.module';
import { PdfGeneratorService } from '../prescriptions/pdf-generator.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST');
        if (!redisHost) {
          // No Redis configured — BullMQ will not connect.
          // QueueService.isEnabled returns false, so no jobs are enqueued.
          return {
            connection: {
              host: 'localhost',
              port: 6379,
              lazyConnect: true,
              maxRetriesPerRequest: 0,
              enableOfflineQueue: false,
              retryStrategy: () => null, // Don't retry connection
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
  providers: [QueueService, EmailProcessor, PdfProcessor, PdfGeneratorService],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
