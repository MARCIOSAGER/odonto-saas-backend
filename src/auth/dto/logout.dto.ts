import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token to also invalidate' })
  @IsString()
  @IsOptional()
  refresh_token?: string;
}
