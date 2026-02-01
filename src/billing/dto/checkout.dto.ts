import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: 'plan-uuid-here' })
  @IsString()
  @IsNotEmpty()
  plan_id: string;

  @ApiPropertyOptional({ example: 'monthly', enum: ['monthly', 'yearly'] })
  @IsString()
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billing_cycle?: string;

  @ApiPropertyOptional({ example: 'credit_card', enum: ['credit_card', 'pix', 'boleto'] })
  @IsString()
  @IsOptional()
  @IsIn(['credit_card', 'pix', 'boleto'])
  payment_method?: string;

  @ApiPropertyOptional({ example: 'stripe', enum: ['stripe', 'asaas'] })
  @IsString()
  @IsOptional()
  @IsIn(['stripe', 'asaas'])
  gateway?: string;

  @ApiPropertyOptional({ example: 'PROMO10' })
  @IsString()
  @IsOptional()
  coupon_code?: string;
}

export class ValidateCouponDto {
  @ApiProperty({ example: 'PROMO10' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
