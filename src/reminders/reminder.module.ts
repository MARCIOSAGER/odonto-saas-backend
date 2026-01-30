import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReminderService } from './reminder.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [ScheduleModule.forRoot(), IntegrationsModule],
  providers: [ReminderService],
})
export class ReminderModule {}
