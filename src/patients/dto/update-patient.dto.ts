import { PartialType } from '@nestjs/swagger';
import { CreatePatientDto } from './create-patient.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePatientDto extends PartialType(CreatePatientDto) {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'] })
  @IsString()
  @IsOptional()
  status?: string;
}
