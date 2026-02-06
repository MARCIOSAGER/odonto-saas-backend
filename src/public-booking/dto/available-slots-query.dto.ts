import { IsString, IsUUID, IsOptional, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AvailableSlotsQueryDto {
  @ApiProperty({ description: 'Data (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: 'ID do serviço' })
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @ApiPropertyOptional({ description: 'ID do dentista (opcional)' })
  @IsUUID()
  @IsOptional()
  dentistId?: string;
}
