import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'João Silva', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'joao@clinica.com', description: 'User email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Senha@123', description: 'User password (min 8 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(50)
  password: string;

  @ApiProperty({ example: 'Clínica Odontológica Silva', description: 'Clinic name' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  clinic_name: string;

  @ApiProperty({ example: '12345678000199', description: 'CPF (11 digits) or CNPJ (14 digits)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\d{11}|\d{14})$/, { message: 'Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)' })
  cnpj: string;

  @ApiProperty({ example: '11999999999', description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,11}$/, { message: 'Phone must have 10 or 11 digits' })
  phone: string;
}
