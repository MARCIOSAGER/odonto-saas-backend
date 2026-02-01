import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ example: 'new-plan-uuid' })
  @IsString()
  @IsNotEmpty()
  plan_id: string;

  @ApiPropertyOptional({ example: 'monthly', enum: ['monthly', 'yearly'] })
  @IsString()
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billing_cycle?: string;
}
