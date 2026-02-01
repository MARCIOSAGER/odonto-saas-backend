import { PartialType } from '@nestjs/swagger';
import { CreateClinicDto } from './create-clinic.dto';
import { IsBoolean, IsOptional, IsString, IsUrl, IsObject, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateClinicDto extends PartialType(CreateClinicDto) {
  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive', 'suspended'] })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Z-API instance ID for WhatsApp' })
  @IsString()
  @IsOptional()
  z_api_instance?: string;

  @ApiPropertyOptional({ description: 'Z-API token for WhatsApp' })
  @IsString()
  @IsOptional()
  z_api_token?: string;

  @ApiPropertyOptional({ description: 'Z-API Client-Token (security token from Z-API account)' })
  @IsString()
  @IsOptional()
  z_api_client_token?: string;

  // Branding
  @ApiPropertyOptional({ description: 'Logo URL', example: 'https://example.com/logo.png' })
  @IsString()
  @IsOptional()
  logo_url?: string;

  @ApiPropertyOptional({ description: 'Favicon URL', example: 'https://example.com/favicon.ico' })
  @IsString()
  @IsOptional()
  favicon_url?: string;

  @ApiPropertyOptional({ description: 'Logo display mode in sidebar', example: 'logo_name', enum: ['logo_name', 'logo_only', 'name_only'] })
  @IsString()
  @IsOptional()
  logo_display_mode?: string;

  @ApiPropertyOptional({ description: 'Primary brand color (hex)', example: '#0EA5E9' })
  @IsString()
  @IsOptional()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, { message: 'primary_color must be a valid hex color' })
  primary_color?: string;

  @ApiPropertyOptional({ description: 'Secondary brand color (hex)', example: '#10B981' })
  @IsString()
  @IsOptional()
  @Matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, { message: 'secondary_color must be a valid hex color' })
  secondary_color?: string;

  @ApiPropertyOptional({ description: 'Clinic slogan', example: 'Seu sorriso é nossa prioridade' })
  @IsString()
  @IsOptional()
  slogan?: string;

  @ApiPropertyOptional({ description: 'Clinic tagline (short description)', example: 'Cuidando do seu sorriso desde 2010' })
  @IsString()
  @IsOptional()
  tagline?: string;

  // Redes Sociais
  @ApiPropertyOptional({ description: 'Instagram handle or URL', example: '@clinica_odonto' })
  @IsString()
  @IsOptional()
  instagram?: string;

  @ApiPropertyOptional({ description: 'Facebook page URL', example: 'https://facebook.com/clinicaodonto' })
  @IsString()
  @IsOptional()
  facebook?: string;

  @ApiPropertyOptional({ description: 'Website URL', example: 'https://clinicaodonto.com.br' })
  @IsString()
  @IsOptional()
  website?: string;

  // Horário de Funcionamento
  @ApiPropertyOptional({
    description: 'Business hours by day of week',
    example: {
      monday: { open: '08:00', close: '18:00' },
      tuesday: { open: '08:00', close: '18:00' },
      wednesday: { open: '08:00', close: '18:00' },
      thursday: { open: '08:00', close: '18:00' },
      friday: { open: '08:00', close: '18:00' },
      saturday: { open: '08:00', close: '12:00' },
      sunday: null,
    },
  })
  @IsObject()
  @IsOptional()
  business_hours?: Record<string, { open: string; close: string } | null>;

  // Onboarding
  @ApiPropertyOptional({ description: 'Whether onboarding has been completed' })
  @IsBoolean()
  @IsOptional()
  onboarding_completed?: boolean;

  // Geolocalização
  @ApiPropertyOptional({ description: 'Clinic latitude', example: '-23.550520' })
  @IsString()
  @IsOptional()
  latitude?: string;

  @ApiPropertyOptional({ description: 'Clinic longitude', example: '-46.633308' })
  @IsString()
  @IsOptional()
  longitude?: string;
}
