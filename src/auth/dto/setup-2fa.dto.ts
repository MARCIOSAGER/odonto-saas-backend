import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetupWhatsApp2faDto {
  @ApiProperty({ description: 'Número de telefone com DDI (ex: 5521999999999)' })
  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  phone: string;
}

export class VerifyTotpSetupDto {
  @ApiProperty({ description: 'Código TOTP de 6 dígitos do app autenticador' })
  @IsString()
  @IsNotEmpty({ message: 'Código é obrigatório' })
  code: string;

  @ApiProperty({ description: 'Secret TOTP para validação' })
  @IsString()
  @IsNotEmpty({ message: 'Secret é obrigatório' })
  secret: string;
}

export class Disable2faDto {
  @ApiProperty({ description: 'Senha atual para confirmar desativação' })
  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  password: string;
}
