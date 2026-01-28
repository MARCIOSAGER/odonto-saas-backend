import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'Limpeza' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Limpeza dental completa com profilaxia' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 150.0 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ example: 30, description: 'Duration in minutes' })
  @IsNumber()
  @Min(15)
  duration: number;
}
