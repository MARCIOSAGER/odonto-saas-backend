import { Module } from '@nestjs/common';
import { DentistsController } from './dentists.controller';
import { DentistsService } from './dentists.service';

@Module({
  controllers: [DentistsController],
  providers: [DentistsService],
  exports: [DentistsService],
})
export class DentistsModule {}
