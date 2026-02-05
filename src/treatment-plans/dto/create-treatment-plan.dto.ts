import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsObject, IsNumber } from 'class-validator';

export class CreateTreatmentPlanDto {
  @ApiProperty()
  @IsUUID()
  patient_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  patient_summary?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  phases?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  total_cost?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  total_sessions?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  recommendations?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  odontogram_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
