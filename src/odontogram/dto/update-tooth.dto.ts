import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateToothDto {
  @ApiProperty({ example: 11, description: 'FDI tooth number (11-48)' })
  @IsInt()
  @Min(11)
  @Max(48)
  tooth_number: number;

  @ApiProperty({
    example: 'cavity',
    enum: [
      'healthy',
      'cavity',
      'restoration',
      'extraction',
      'implant',
      'crown',
      'bridge',
      'root_canal',
      'fracture',
      'missing',
    ],
  })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({
    example: { mesial: 'cavity', distal: 'restoration' },
    description: 'Surface-level conditions (M, D, V/B, L/P, O/I)',
  })
  @IsObject()
  @IsOptional()
  surfaces?: Record<string, string>;

  @ApiPropertyOptional({ example: 'Cárie profunda, necessita restauração' })
  @IsString()
  @IsOptional()
  notes?: string;
}
