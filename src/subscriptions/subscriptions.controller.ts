import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('subscriptions')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('current')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Get current subscription' })
  @ApiResponse({ status: 200, description: 'Current subscription' })
  async getCurrent(@CurrentUser() user: { clinicId: string }) {
    return this.subscriptionsService.getCurrent(user.clinicId);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get subscription usage and limits' })
  @ApiResponse({ status: 200, description: 'Usage data' })
  async getUsage(@CurrentUser() user: { clinicId: string }) {
    return this.subscriptionsService.getUsage(user.clinicId);
  }

  @Post()
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Create subscription' })
  @ApiResponse({ status: 201, description: 'Subscription created' })
  async create(
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.subscriptionsService.create(user.clinicId, dto);
  }

  @Post('change-plan')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Change plan (upgrade/downgrade)' })
  @ApiResponse({ status: 200, description: 'Plan changed' })
  async changePlan(
    @Body() dto: ChangePlanDto,
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.subscriptionsService.changePlan(user.clinicId, dto);
  }

  @Post('cancel')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  async cancel(@CurrentUser() user: { clinicId: string }) {
    return this.subscriptionsService.cancel(user.clinicId);
  }

  @Post('reactivate')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Reactivate cancelled subscription' })
  @ApiResponse({ status: 200, description: 'Subscription reactivated' })
  async reactivate(@CurrentUser() user: { clinicId: string }) {
    return this.subscriptionsService.reactivate(user.clinicId);
  }

  @Get('invoices')
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'List invoices' })
  @ApiResponse({ status: 200, description: 'Invoices list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getInvoices(
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.subscriptionsService.getInvoices(
      user.clinicId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
