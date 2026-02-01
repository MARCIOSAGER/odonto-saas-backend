import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserRoleDto {
  @ApiProperty({ example: 'admin', enum: ['user', 'admin', 'superadmin'] })
  @IsString()
  @IsIn(['user', 'admin', 'superadmin'])
  role: string;
}
