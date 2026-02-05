import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

export class UpdateEmailSettingsDto {
  @ApiPropertyOptional({ description: 'SMTP server host', example: 'smtp.gmail.com' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  smtp_host?: string;

  @ApiPropertyOptional({ description: 'SMTP server port', example: 465 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(65535)
  smtp_port?: number;

  @ApiPropertyOptional({ description: 'SMTP username/email', example: 'clinica@gmail.com' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  smtp_user?: string;

  @ApiPropertyOptional({ description: 'SMTP password' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  smtp_pass?: string;

  @ApiPropertyOptional({
    description: 'From address for outgoing emails',
    example: 'Clinica <noreply@clinica.com>',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  smtp_from?: string;

  @ApiPropertyOptional({ description: 'Use SSL/TLS', default: true })
  @IsBoolean()
  @IsOptional()
  smtp_secure?: boolean;
}
