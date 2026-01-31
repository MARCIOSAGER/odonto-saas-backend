import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token de redefinição recebido por email' })
  @IsString()
  @IsNotEmpty({ message: 'Token é obrigatório' })
  token: string;

  @ApiProperty({ description: 'Nova senha', minLength: 8, maxLength: 50 })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @MaxLength(50, { message: 'Senha deve ter no máximo 50 caracteres' })
  password: string;
}
