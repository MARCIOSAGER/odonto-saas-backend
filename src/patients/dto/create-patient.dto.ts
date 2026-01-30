import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'Carlos Oliveira' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '11999999999' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,11}$/, { message: 'Phone must have 10 or 11 digits' })
  phone: string;

  @ApiPropertyOptional({ example: '12345678901', description: 'CPF (11 digits)' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'CPF must have 11 digits' })
  cpf?: string;

  @ApiPropertyOptional({ example: 'carlos@email.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birth_date must be in YYYY-MM-DD format' })
  birth_date?: string;

  @ApiPropertyOptional({ example: 'Rua das Palmeiras, 456' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Paciente com alergia a penicilina' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
