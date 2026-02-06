import {
  IsString,
  IsUUID,
  IsOptional,
  IsNotEmpty,
  IsEmail,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientInputDto {
  @ApiProperty({ description: 'Nome completo do paciente' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Telefone (WhatsApp)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,11}$/, { message: 'Telefone deve ter 10 ou 11 dígitos' })
  phone: string;

  @ApiPropertyOptional({ description: 'CPF (opcional)' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'CPF deve ter 11 dígitos' })
  cpf?: string;

  @ApiPropertyOptional({ description: 'E-mail (opcional)' })
  @IsEmail()
  @IsOptional()
  email?: string;
}

export class CreatePublicBookingDto {
  @ApiProperty({ description: 'ID do serviço' })
  @IsUUID()
  @IsNotEmpty()
  service_id: string;

  @ApiPropertyOptional({ description: 'ID do dentista (opcional)' })
  @IsUUID()
  @IsOptional()
  dentist_id?: string;

  @ApiProperty({ description: 'Data do agendamento (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: 'Hora do agendamento (HH:MM)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Hora deve estar no formato HH:MM' })
  time: string;

  @ApiProperty({ description: 'Dados do paciente', type: PatientInputDto })
  @ValidateNested()
  @Type(() => PatientInputDto)
  patient: PatientInputDto;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
