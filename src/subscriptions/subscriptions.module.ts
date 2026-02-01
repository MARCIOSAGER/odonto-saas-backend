import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { TrialSchedulerService } from './trial-scheduler.service';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, TrialSchedulerService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
