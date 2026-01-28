import { PartialType } from '@nestjs/swagger';
import { CreateDentistDto } from './create-dentist.dto';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDentistDto extends PartialType(CreateDentistDto) {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'] })
  @IsString()
  @IsOptional()
  status?: string;
}
