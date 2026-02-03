import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { CreateAnamnesisDto } from './create-anamnesis.dto';

export class UpdateAnamnesisDto extends PartialType(CreateAnamnesisDto) {
  @ApiPropertyOptional({ description: 'Risk classification (e.g. low, medium, high)' })
  @IsString()
  @IsOptional()
  risk_classification?: string;

  @ApiPropertyOptional({ description: 'Contraindications' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  contraindications?: string[];

  @ApiPropertyOptional({ description: 'Clinical alerts' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  alerts?: string[];

  @ApiPropertyOptional({ description: 'Warnings for procedures' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  warnings?: string[];

  @ApiPropertyOptional({ description: 'AI-generated notes' })
  @IsString()
  @IsOptional()
  ai_notes?: string;

  @ApiPropertyOptional({ description: 'AI-generated recommendations' })
  @IsString()
  @IsOptional()
  ai_recommendations?: string;
}
