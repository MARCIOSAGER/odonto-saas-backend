import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OdontogramEntryType } from '@prisma/client';

export class OdontogramQueryDto {
  @ApiPropertyOptional({
    example: 36,
    description: 'Filter by specific tooth number',
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(11)
  @Max(85)
  tooth_number?: number;

  @ApiPropertyOptional({
    enum: OdontogramEntryType,
    example: 'FINDING',
    description: 'Filter by entry type',
  })
  @IsOptional()
  @IsEnum(OdontogramEntryType)
  entry_type?: OdontogramEntryType;

  @ApiPropertyOptional({
    example: false,
    description: 'Include superseded entries (default: false)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_superseded?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 50, description: 'Items per page' })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
