import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { CreateTreatmentPlanDto } from './create-treatment-plan.dto';

export class UpdateTreatmentPlanDto extends PartialType(CreateTreatmentPlanDto) {
  @ApiPropertyOptional({
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['pending', 'in_progress', 'completed', 'cancelled'])
  status?: string;
}
