import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate a coupon code and return its discount info
   */
  async validate(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (!coupon.is_active) {
      throw new BadRequestException('Coupon is no longer active');
    }

    if (coupon.valid_until && new Date() > coupon.valid_until) {
      throw new BadRequestException('Coupon has expired');
    }

    if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    return {
      code: coupon.code,
      discount_percent: coupon.discount_percent,
      discount_months: coupon.discount_months,
      valid: true,
    };
  }

  /**
   * Apply a coupon (increment usage counter)
   */
  async apply(code: string) {
    const coupon = await this.validate(code);

    await this.prisma.coupon.update({
      where: { code: code.toUpperCase() },
      data: { current_uses: { increment: 1 } },
    });

    return coupon;
  }

  /**
   * List all coupons (admin)
   */
  async findAll() {
    return this.prisma.coupon.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Create a new coupon (admin)
   */
  async create(data: {
    code: string;
    discount_percent: number;
    discount_months?: number;
    max_uses?: number;
    valid_until?: Date;
  }) {
    const existing = await this.prisma.coupon.findUnique({
      where: { code: data.code.toUpperCase() },
    });

    if (existing) {
      throw new BadRequestException('Coupon code already exists');
    }

    return this.prisma.coupon.create({
      data: {
        code: data.code.toUpperCase(),
        discount_percent: data.discount_percent,
        discount_months: data.discount_months ?? 1,
        max_uses: data.max_uses ?? null,
        valid_until: data.valid_until ?? null,
        is_active: true,
      },
    });
  }

  /**
   * Update coupon (admin)
   */
  async update(
    id: string,
    data: {
      discount_percent?: number;
      discount_months?: number;
      max_uses?: number | null;
      valid_until?: Date | null;
      is_active?: boolean;
    },
  ) {
    return this.prisma.coupon.update({
      where: { id },
      data,
    });
  }
}
