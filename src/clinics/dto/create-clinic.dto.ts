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

export class CreateClinicDto {
  @ApiProperty({ example: 'Clínica Odontológica Silva' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '12345678000199', description: 'CNPJ (14 digits)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{14}$/, { message: 'CNPJ must have 14 digits' })
  cnpj: string;

  @ApiProperty({ example: '11999999999' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,11}$/, { message: 'Phone must have 10 or 11 digits' })
  phone: string;

  @ApiProperty({ example: 'contato@clinica.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 'Rua das Flores, 123' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsString()
  @IsOptional()
  @MaxLength(2)
  state?: string;

  @ApiPropertyOptional({ example: '12345-678', description: 'CEP (formato 12345-678 ou 12345678)' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP deve ter formato válido (12345-678 ou 12345678)' })
  cep?: string;

  @ApiPropertyOptional({ example: 'premium', enum: ['basic', 'standard', 'premium'] })
  @IsString()
  @IsOptional()
  plan?: string;
}
