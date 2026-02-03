import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private parseDates(start?: string, end?: string) {
    const now = new Date();
    const startDate = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const endDate = end ? new Date(end) : now;
    return { startDate, endDate };
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report' })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async getRevenue(
    @CurrentUser() user: { clinicId: string },
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { startDate, endDate } = this.parseDates(start, end);
    return this.reportsService.getRevenue(user.clinicId, startDate, endDate);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Appointments report' })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async getAppointments(
    @CurrentUser() user: { clinicId: string },
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { startDate, endDate } = this.parseDates(start, end);
    return this.reportsService.getAppointments(user.clinicId, startDate, endDate);
  }

  @Get('patients')
  @ApiOperation({ summary: 'Patients report' })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async getPatients(
    @CurrentUser() user: { clinicId: string },
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { startDate, endDate } = this.parseDates(start, end);
    return this.reportsService.getPatients(user.clinicId, startDate, endDate);
  }

  @Get('services')
  @ApiOperation({ summary: 'Services report' })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async getServices(
    @CurrentUser() user: { clinicId: string },
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { startDate, endDate } = this.parseDates(start, end);
    return this.reportsService.getServices(user.clinicId, startDate, endDate);
  }

  @Get('commissions')
  @ApiOperation({ summary: 'Commissions report' })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async getCommissions(
    @CurrentUser() user: { clinicId: string },
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { startDate, endDate } = this.parseDates(start, end);
    return this.reportsService.getCommissions(user.clinicId, startDate, endDate);
  }

  @Get('cashflow')
  @ApiOperation({ summary: 'Cashflow projection' })
  async getCashflow(@CurrentUser() user: { clinicId: string }) {
    return this.reportsService.getCashflow(user.clinicId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export report as CSV' })
  @ApiQuery({ name: 'type', required: true, enum: ['revenue', 'appointments', 'patients', 'commissions'] })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async exportCsv(
    @CurrentUser() user: { clinicId: string },
    @Query('type') type: string,
    @Res() res: Response,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { startDate, endDate } = this.parseDates(start, end);
    const csv = await this.reportsService.exportCsv(user.clinicId, type, startDate, endDate);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio-${type}.csv`);
    res.send('\uFEFF' + csv); // BOM for Excel compatibility
  }

  @Get('export-pdf')
  @ApiOperation({ summary: 'Export report as PDF' })
  @ApiQuery({ name: 'type', required: true, enum: ['revenue', 'appointments', 'patients', 'commissions', 'services'] })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async exportPdf(
    @CurrentUser() user: { clinicId: string },
    @Query('type') type: string,
    @Res() res: Response,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const { startDate, endDate } = this.parseDates(start, end);
    const pdfBuffer = await this.reportsService.exportPdf(user.clinicId, type, startDate, endDate);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio-${type}.pdf`);
    res.send(pdfBuffer);
  }
}
