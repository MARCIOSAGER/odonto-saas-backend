import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateLegendDto {
  @ApiProperty({
    example: 'CARIES_SUSPECTED',
    description: 'Unique code for this legend item',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'Carie Suspeita',
    description: 'Display label for this legend item',
  })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({
    example: '#EF4444',
    description: 'Hex color code in #RRGGBB format',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a valid hex color in #RRGGBB format',
  })
  color: string;

  @ApiPropertyOptional({
    example: 'tooth-cavity',
    description: 'Optional icon identifier',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    example: 'finding',
    enum: ['finding', 'procedure', 'general'],
    description: 'Category for grouping legend items',
  })
  @IsOptional()
  @IsString()
  @IsIn(['finding', 'procedure', 'general'])
  category?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Sort order for display',
  })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this legend item is active',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
