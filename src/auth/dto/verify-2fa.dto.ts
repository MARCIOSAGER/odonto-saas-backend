import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2faDto {
  @ApiProperty({ description: 'Token temporário de 2FA recebido após login' })
  @IsString()
  @IsNotEmpty({ message: 'Token 2FA é obrigatório' })
  two_factor_token: string;

  @ApiProperty({ description: 'Código de verificação de 6 dígitos' })
  @IsString()
  @IsNotEmpty({ message: 'Código é obrigatório' })
  code: string;

  @ApiProperty({ description: 'Método 2FA: whatsapp ou totp', required: false })
  @IsString()
  @IsOptional()
  method?: string;
}

export class Send2faCodeDto {
  @ApiProperty({ description: 'Token temporário de 2FA' })
  @IsString()
  @IsNotEmpty({ message: 'Token 2FA é obrigatório' })
  two_factor_token: string;
}
