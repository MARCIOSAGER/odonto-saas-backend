import { PartialType } from '@nestjs/swagger';
import { CreateClinicDto } from './create-clinic.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateClinicDto extends PartialType(CreateClinicDto) {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive', 'suspended'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Z-API instance ID for WhatsApp' })
  @IsString()
  @IsOptional()
  z_api_instance?: string;

  @ApiPropertyOptional({ description: 'Z-API token for WhatsApp' })
  @IsString()
  @IsOptional()
  z_api_token?: string;
}
