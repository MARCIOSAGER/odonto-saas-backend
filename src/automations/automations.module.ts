import { Module } from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { AutomationsController } from './automations.controller';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationSchedulerService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
