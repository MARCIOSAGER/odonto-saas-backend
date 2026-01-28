import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppointmentEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  clinic_id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  patient_id: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440003' })
  dentist_id?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440004' })
  service_id: string;

  @ApiProperty({ example: '2024-01-15T00:00:00.000Z' })
  date: Date;

  @ApiProperty({ example: '09:00' })
  time: string;

  @ApiPropertyOptional({ example: 30 })
  duration?: number;

  @ApiProperty({ example: 'scheduled' })
  status: string;

  @ApiPropertyOptional({ example: 'Paciente solicitou anestesia local' })
  notes?: string;

  @ApiProperty({ example: false })
  reminder_sent: boolean;

  @ApiPropertyOptional({ example: '2024-01-14T15:00:00.000Z' })
  confirmed_at?: Date;

  @ApiPropertyOptional({ example: '2024-01-14T16:00:00.000Z' })
  cancelled_at?: Date;

  @ApiPropertyOptional({ example: 'Paciente não pode comparecer' })
  cancel_reason?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updated_at: Date;
}
