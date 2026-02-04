import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CouponService } from './coupon.service';
import { NfseService } from './nfse/nfse.service';
import { CheckoutDto, ValidateCouponDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('billing')
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly couponService: CouponService,
    private readonly nfseService: NfseService,
  ) {}

  // ===================== CHECKOUT =====================

  @Post('checkout')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Create checkout session' })
  @ApiResponse({ status: 201, description: 'Checkout created' })
  async checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.billingService.checkout(user.clinicId, dto);
  }

  // ===================== COUPONS =====================

  @Post('coupons/validate')
  @ApiOperation({ summary: 'Validate a coupon code' })
  @ApiResponse({ status: 200, description: 'Coupon valid' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.couponService.validate(dto.code);
  }

  // ===================== NFS-e =====================

  @Post('nfse/:invoiceId/emit')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Emit NFS-e for invoice' })
  async emitNfse(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() _user: { clinicId: string },
  ) {
    return this.nfseService.reprocess(invoiceId);
  }

  @Post('nfse/:invoiceId/cancel')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Cancel NFS-e' })
  async cancelNfse(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body('reason') reason: string,
  ) {
    return this.nfseService.cancel(invoiceId, reason);
  }

  @Get('nfse/:invoiceId/pdf')
  @ApiOperation({ summary: 'Get NFS-e PDF URL' })
  async getNfsePdf(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    const url = await this.nfseService.getPdfUrl(invoiceId);
    return { pdf_url: url };
  }

  // ===================== ADMIN =====================

  @Get('admin/overview')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Admin billing overview (MRR, subs, revenue)' })
  async adminOverview() {
    return this.billingService.getAdminOverview();
  }

  @Get('admin/invoices')
  @Roles('superadmin')
  @ApiOperation({ summary: 'List all invoices (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'clinic_id', required: false, type: String })
  async adminInvoices(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('clinic_id') clinicId?: string,
  ) {
    return this.billingService.getAdminInvoices(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { status, clinic_id: clinicId },
    );
  }

  @Get('admin/coupons')
  @Roles('superadmin')
  @ApiOperation({ summary: 'List all coupons (admin)' })
  async adminCoupons() {
    return this.couponService.findAll();
  }

  @Post('admin/coupons')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create coupon (admin)' })
  async createCoupon(
    @Body()
    body: {
      code: string;
      discount_percent: number;
      discount_months?: number;
      max_uses?: number;
      valid_until?: string;
    },
  ) {
    return this.couponService.create({
      ...body,
      valid_until: body.valid_until ? new Date(body.valid_until) : undefined,
    });
  }
}
