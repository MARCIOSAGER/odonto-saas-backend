import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'standard' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'Padrão' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  display_name: string;

  @ApiPropertyOptional({ example: 'Para clínicas em crescimento.' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 197.0 })
  @IsNumber()
  @Min(0)
  price_monthly: number;

  @ApiPropertyOptional({ example: 1970.0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  price_yearly?: number;

  @ApiPropertyOptional({ example: 500, description: 'null = unlimited' })
  @IsInt()
  @IsOptional()
  @Min(1)
  max_patients?: number;

  @ApiPropertyOptional({ example: 10, description: 'null = unlimited' })
  @IsInt()
  @IsOptional()
  @Min(1)
  max_dentists?: number;

  @ApiPropertyOptional({ example: 1000, description: 'null = unlimited' })
  @IsInt()
  @IsOptional()
  @Min(1)
  max_appointments_month?: number;

  @ApiPropertyOptional({ example: 5000, description: 'null = unlimited' })
  @IsInt()
  @IsOptional()
  @Min(1)
  max_whatsapp_messages?: number;

  @ApiPropertyOptional({
    example: {
      has_whatsapp: true,
      has_ai: true,
      ai_level: 'basic',
      has_odontogram: true,
      has_reports: true,
      reports_level: 'full',
    },
  })
  @IsObject()
  @IsOptional()
  features?: Record<string, unknown>;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  ai_enabled?: boolean;

  @ApiPropertyOptional({ example: 500, description: 'null = unlimited' })
  @IsInt()
  @IsOptional()
  @Min(1)
  ai_messages_limit?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  priority_support?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  custom_branding?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  api_access?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Min(0)
  sort_order?: number;
}
