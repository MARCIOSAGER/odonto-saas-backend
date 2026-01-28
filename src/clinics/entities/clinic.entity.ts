import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClinicEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'Clínica Odontológica Silva' })
  name: string;

  @ApiProperty({ example: '12345678000199' })
  cnpj: string;

  @ApiProperty({ example: '11999999999' })
  phone: string;

  @ApiProperty({ example: 'contato@clinica.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Rua das Flores, 123' })
  address?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  state?: string;

  @ApiPropertyOptional({ example: 'instance_123' })
  z_api_instance?: string;

  @ApiProperty({ example: 'premium' })
  plan: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updated_at: Date;
}
