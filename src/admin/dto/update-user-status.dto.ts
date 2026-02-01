import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({ example: 'active', enum: ['active', 'inactive'] })
  @IsString()
  @IsIn(['active', 'inactive'])
  status: string;
}
