import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  clinic_id: string;

  @ApiProperty({ example: 'Carlos Oliveira' })
  name: string;

  @ApiProperty({ example: '11999999999' })
  phone: string;

  @ApiPropertyOptional({ example: '12345678901' })
  cpf?: string;

  @ApiPropertyOptional({ example: 'carlos@email.com' })
  email?: string;

  @ApiPropertyOptional({ example: '1990-05-15' })
  birth_date?: Date;

  @ApiPropertyOptional({ example: 'Rua das Palmeiras, 456' })
  address?: string;

  @ApiPropertyOptional({ example: 'Paciente com alergia a penicilina' })
  notes?: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiPropertyOptional({ example: '2024-01-15T10:00:00.000Z' })
  last_visit?: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updated_at: Date;
}
