import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateClinicStatusDto {
  @ApiProperty({ example: 'active', enum: ['active', 'inactive', 'suspended'] })
  @IsString()
  @IsIn(['active', 'inactive', 'suspended'])
  status: string;
}
