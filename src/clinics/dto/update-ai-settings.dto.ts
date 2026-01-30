import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ description: 'Enable/disable AI assistant', default: true })
  @IsBoolean()
  @IsOptional()
  ai_enabled?: boolean;

  @ApiPropertyOptional({ description: 'AI provider (anthropic, openai, google)', example: 'anthropic' })
  @IsString()
  @IsOptional()
  ai_provider?: string;

  @ApiPropertyOptional({ description: 'API key for the AI provider' })
  @IsString()
  @IsOptional()
  ai_api_key?: string;

  @ApiPropertyOptional({ description: 'AI model to use', example: 'claude-3-5-haiku-20241022' })
  @IsString()
  @IsOptional()
  ai_model?: string;

  @ApiPropertyOptional({ description: 'AI temperature (0.0 - 1.0)', example: 0.7 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1)
  ai_temperature?: number;

  @ApiPropertyOptional({ description: 'Max tokens for AI response', example: 800 })
  @IsInt()
  @IsOptional()
  @Min(100)
  @Max(4000)
  max_tokens?: number;

  @ApiPropertyOptional({ description: 'Assistant name', example: 'Sofia' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  assistant_name?: string;

  @ApiPropertyOptional({ description: 'Assistant personality description', example: 'Amigável e profissional' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  assistant_personality?: string;

  @ApiPropertyOptional({ description: 'Welcome message', example: 'Olá! Sou a Sofia, assistente virtual. Como posso ajudar?' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  welcome_message?: string;

  @ApiPropertyOptional({ description: 'Fallback message when AI cannot understand', example: 'Desculpe, não entendi. Pode reformular?' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  fallback_message?: string;

  @ApiPropertyOptional({ description: 'Message sent outside working hours', example: 'Estamos fora do horário de atendimento.' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  out_of_hours_message?: string;

  @ApiPropertyOptional({ description: 'Keywords that trigger transfer to human', example: ['urgente', 'humano', 'atendente'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  transfer_keywords?: string[];

  @ApiPropertyOptional({ description: 'Topics AI should not discuss', example: ['política', 'religião'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  blocked_topics?: string[];

  @ApiPropertyOptional({ description: 'Custom instructions for the AI' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  custom_instructions?: string;

  @ApiPropertyOptional({ description: 'Number of context messages to send', default: 10 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  context_messages?: number;

  @ApiPropertyOptional({ description: 'AI can schedule appointments automatically', default: false })
  @IsBoolean()
  @IsOptional()
  auto_schedule?: boolean;

  @ApiPropertyOptional({ description: 'AI can confirm appointments automatically', default: false })
  @IsBoolean()
  @IsOptional()
  auto_confirm?: boolean;

  @ApiPropertyOptional({ description: 'AI can cancel appointments automatically', default: false })
  @IsBoolean()
  @IsOptional()
  auto_cancel?: boolean;

  @ApiPropertyOptional({ description: 'Notify when transferring to human', default: true })
  @IsBoolean()
  @IsOptional()
  notify_on_transfer?: boolean;

  @ApiPropertyOptional({ description: 'AI only responds during working hours', default: false })
  @IsBoolean()
  @IsOptional()
  working_hours_only?: boolean;

  // Interactive messages
  @ApiPropertyOptional({ description: 'Show options list on first contact', default: false })
  @IsBoolean()
  @IsOptional()
  use_welcome_menu?: boolean;

  @ApiPropertyOptional({ description: 'Use interactive buttons for appointment confirmation', default: false })
  @IsBoolean()
  @IsOptional()
  use_confirmation_buttons?: boolean;

  @ApiPropertyOptional({ description: 'Show time slots as selectable list', default: false })
  @IsBoolean()
  @IsOptional()
  use_timeslot_list?: boolean;

  @ApiPropertyOptional({ description: 'Send satisfaction poll after appointment', default: false })
  @IsBoolean()
  @IsOptional()
  use_satisfaction_poll?: boolean;

  @ApiPropertyOptional({ description: 'Send clinic location when asked', default: false })
  @IsBoolean()
  @IsOptional()
  use_send_location?: boolean;

  // Dentist AI interaction
  @ApiPropertyOptional({ description: 'Dentists can interact with AI via WhatsApp', default: false })
  @IsBoolean()
  @IsOptional()
  dentist_ai_enabled?: boolean;

  // Reminders
  @ApiPropertyOptional({ description: 'Enable automatic appointment reminders', default: true })
  @IsBoolean()
  @IsOptional()
  reminder_enabled?: boolean;

  @ApiPropertyOptional({ description: 'Send reminder 24h before appointment', default: true })
  @IsBoolean()
  @IsOptional()
  reminder_24h?: boolean;

  @ApiPropertyOptional({ description: 'Send reminder 1h before appointment', default: true })
  @IsBoolean()
  @IsOptional()
  reminder_1h?: boolean;

  @ApiPropertyOptional({ description: 'Custom 24h reminder message. Variables: {patientName}, {date}, {time}, {service}, {dentist}, {clinicName}' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reminder_message_24h?: string;

  @ApiPropertyOptional({ description: 'Custom 1h reminder message. Variables: {patientName}, {date}, {time}, {service}, {dentist}, {clinicName}' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reminder_message_1h?: string;
}
