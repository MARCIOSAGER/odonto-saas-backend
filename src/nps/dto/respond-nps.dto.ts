import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RespondNpsDto {
  @ApiProperty({ description: 'NPS score (0–10)', example: 9 })
  @IsNumber()
  @Min(0)
  @Max(10)
  score: number;

  @ApiPropertyOptional({ description: 'Optional feedback text' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  feedback?: string;
}
