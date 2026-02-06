import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HofService } from './hof.service';

interface UserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

@ApiTags('hof')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('hof')
export class HofController {
  constructor(private readonly hofService: HofService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get HOF dashboard summary cards' })
  async getDashboard(
    @CurrentUser() user: UserPayload,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    return this.hofService.getDashboard(user.clinicId, startDate, endDate);
  }

  @Get('recent-procedures')
  @ApiOperation({ summary: 'Get recent HOF procedures list' })
  async getRecentProcedures(
    @CurrentUser() user: UserPayload,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('procedureType') procedureType?: string,
    @Query('dentistId') dentistId?: string,
  ) {
    return this.hofService.getRecentProcedures(user.clinicId, {
      limit: limit ? parseInt(limit) : 20,
      page: page ? parseInt(page) : 1,
      procedureType,
      dentistId,
    });
  }

  @Get('legend')
  @ApiOperation({ summary: 'Get HOF legend items for the clinic' })
  async getLegend(@CurrentUser() user: UserPayload) {
    return this.hofService.getLegend(user.clinicId);
  }

  @Get('reports/revenue')
  @ApiOperation({ summary: 'Get HOF revenue report' })
  async getRevenueReport(
    @CurrentUser() user: UserPayload,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    return this.hofService.getRevenueReport(user.clinicId, startDate, endDate);
  }

  @Get('reports/procedures')
  @ApiOperation({ summary: 'Get most performed HOF procedures report' })
  async getProceduresReport(
    @CurrentUser() user: UserPayload,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    return this.hofService.getProceduresReport(user.clinicId, startDate, endDate);
  }

  @Get('reports/products')
  @ApiOperation({ summary: 'Get most used HOF products report' })
  async getProductsReport(
    @CurrentUser() user: UserPayload,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    return this.hofService.getProductsReport(user.clinicId, startDate, endDate);
  }
}
