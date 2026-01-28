import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsNotEmpty()
  patient_id: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsOptional()
  dentist_id?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsUUID()
  @IsNotEmpty()
  service_id: string;

  @ApiProperty({ example: '2024-01-15', description: 'Date (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: '09:00', description: 'Time (HH:MM)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'Time must be in HH:MM format' })
  time: string;

  @ApiPropertyOptional({ example: 'Paciente solicitou anestesia local' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
