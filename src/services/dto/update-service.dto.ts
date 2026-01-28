import { PartialType } from '@nestjs/swagger';
import { CreateServiceDto } from './create-service.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'] })
  @IsString()
  @IsOptional()
  status?: string;
}
