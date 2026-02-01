import { Module } from '@nestjs/common';
import { AiClinicalService } from './ai-clinical.service';
import { AiClinicalController } from './ai-clinical.controller';

@Module({
  controllers: [AiClinicalController],
  providers: [AiClinicalService],
  exports: [AiClinicalService],
})
export class AiClinicalModule {}
