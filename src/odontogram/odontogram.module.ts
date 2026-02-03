import { Module } from '@nestjs/common';
import { OdontogramController } from './odontogram.controller';
import { OdontogramService } from './odontogram.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [OdontogramController],
  providers: [OdontogramService],
  exports: [OdontogramService],
})
export class OdontogramModule {}
