import { PartialType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @ApiPropertyOptional({
    example: 'confirmed',
    enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
  })
  @IsString()
  @IsOptional()
  status?: string;
}
