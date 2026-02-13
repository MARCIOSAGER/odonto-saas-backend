import { Module, Global } from '@nestjs/common';
import { SecurityAlertsService } from './security-alerts.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Global()
@Module({
  imports: [NotificationsModule, EmailModule],
  providers: [SecurityAlertsService],
  exports: [SecurityAlertsService],
})
export class SecurityAlertsModule {}
