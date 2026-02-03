import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  IsArray,
} from 'class-validator';
import { OdontogramEntryType, ToothSurface } from '@prisma/client';

export class CreateEntryDto {
  @ApiProperty({
    example: 36,
    description: 'FDI tooth number (11-48 permanent, 51-85 deciduous)',
  })
  @IsInt()
  @Min(11)
  @Max(85)
  tooth_number: number;

  @ApiProperty({
    enum: OdontogramEntryType,
    example: 'FINDING',
    description: 'Type of entry: FINDING, PROCEDURE, or NOTE',
  })
  @IsEnum(OdontogramEntryType)
  @IsNotEmpty()
  entry_type: OdontogramEntryType;

  @ApiProperty({
    example: 'CARIES_SUSPECTED',
    description: 'Status code matching the legend (e.g. CARIES_SUSPECTED, RESTORATION_COMPOSITE)',
  })
  @IsString()
  @IsNotEmpty()
  status_code: string;

  @ApiPropertyOptional({
    enum: ToothSurface,
    isArray: true,
    example: ['M', 'D'],
    description: 'Affected surfaces. Defaults to [WHOLE] if not provided.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(ToothSurface, { each: true })
  surfaces?: ToothSurface[];

  @ApiPropertyOptional({
    example: 'Cavidade visivel na superficie mesial',
    description: 'Additional clinical notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: 'uuid-here',
    description: 'Link this entry to an existing treatment plan item',
  })
  @IsOptional()
  @IsUUID()
  treatment_plan_item_id?: string;
}
