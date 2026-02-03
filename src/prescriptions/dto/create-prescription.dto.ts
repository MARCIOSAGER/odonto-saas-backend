import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsIn, IsObject, IsUUID, IsOptional } from 'class-validator';

export class CreatePrescriptionDto {
  @ApiProperty({ description: 'Patient ID' })
  @IsUUID()
  patient_id: string;

  @ApiProperty({ description: 'Dentist ID' })
  @IsUUID()
  dentist_id: string;

  @ApiProperty({
    description: 'Type of document',
    enum: ['prescription', 'certificate', 'referral'],
  })
  @IsIn(['prescription', 'certificate', 'referral'])
  type: string;

  @ApiProperty({
    description: 'Content JSON: { medications: [...] } or { text: "..." }',
    example: {
      medications: [
        {
          name: 'Amoxicilina 500mg',
          dosage: '1 cápsula',
          frequency: 'de 8 em 8 horas',
          duration: '7 dias',
          notes: 'Tomar após as refeições',
        },
      ],
    },
  })
  @IsObject()
  content: Record<string, unknown>;
}
