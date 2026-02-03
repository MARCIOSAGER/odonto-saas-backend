import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';

export class CreateAnamnesisDto {
  @ApiProperty({ description: 'Patient ID' })
  @IsUUID()
  patient_id: string;

  @ApiPropertyOptional({ description: 'List of allergies' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergies?: string[];

  @ApiPropertyOptional({ description: 'Current medications' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  medications?: string[];

  @ApiPropertyOptional({ description: 'Pre-existing conditions' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  conditions?: string[];

  @ApiPropertyOptional({ description: 'Previous surgeries' })
  @IsString()
  @IsOptional()
  surgeries?: string;

  @ApiPropertyOptional({ description: 'Habits (smoking, alcohol, etc.)' })
  @IsObject()
  @IsOptional()
  habits?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Raw questionnaire answers' })
  @IsObject()
  @IsOptional()
  raw_answers?: Record<string, unknown>;
}
