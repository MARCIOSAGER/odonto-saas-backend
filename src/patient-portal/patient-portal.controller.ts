import { Controller, Get, Post, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PatientPortalService } from './patient-portal.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('patient-portal')
@Controller()
export class PatientPortalController {
  constructor(private readonly portalService: PatientPortalService) {}

  // === Public endpoints (accessed by patient via token) ===

  @Get('portal/:token')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get patient portal data by token' })
  @ApiResponse({ status: 200, description: 'Patient portal data' })
  async getPortalData(@Param('token') token: string) {
    return this.portalService.getByToken(token);
  }

  @Get('portal/:token/appointments')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get patient appointments via portal' })
  async getPortalAppointments(@Param('token') token: string) {
    return this.portalService.getAppointments(token);
  }

  @Get('portal/:token/prescriptions')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get patient prescriptions via portal' })
  async getPortalPrescriptions(@Param('token') token: string) {
    return this.portalService.getPrescriptions(token);
  }

  // === Authenticated endpoints (used by clinic staff) ===

  @Get('patients/:patientId/portal-link')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get portal link for a patient' })
  async getPortalLink(
    @CurrentUser() user: { clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.portalService.getPortalLink(user.clinicId, patientId);
  }

  @Post('patients/:patientId/portal-link/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Regenerate portal token for a patient' })
  async regeneratePortalLink(
    @CurrentUser() user: { clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.portalService.regenerateToken(user.clinicId, patientId);
  }
}
