import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID Token from OAuth flow' })
  @IsString()
  @IsNotEmpty({ message: 'Google ID token é obrigatório' })
  google_id_token: string;
}
