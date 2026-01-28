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

export class CreateDentistDto {
  @ApiProperty({ example: 'Dr. João Silva' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'SP-12345', description: 'CRO number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cro: string;

  @ApiPropertyOptional({ example: 'Ortodontia' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  specialty?: string;

  @ApiPropertyOptional({ example: '11988888888' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{10,11}$/, { message: 'Phone must have 10 or 11 digits' })
  phone?: string;

  @ApiPropertyOptional({ example: 'dr.joao@clinica.com' })
  @IsEmail()
  @IsOptional()
  email?: string;
}
