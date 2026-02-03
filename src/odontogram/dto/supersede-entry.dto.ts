import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SupersedeEntryDto {
  @ApiPropertyOptional({
    example: 'Diagnostico reavaliado apos radiografia panoramica',
    description: 'Reason for superseding the original entry',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
