import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PdfGeneratorService } from './pdf-generator.service';

@Module({
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PdfGeneratorService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
