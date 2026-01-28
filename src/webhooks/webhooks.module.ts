import { Module } from '@nestjs/common';
import { ZApiController } from './z-api.controller';
import { ZApiService } from './z-api.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PatientsModule } from '../patients/patients.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [IntegrationsModule, PatientsModule, AppointmentsModule],
  controllers: [ZApiController],
  providers: [ZApiService],
  exports: [ZApiService],
})
export class WebhooksModule {}
