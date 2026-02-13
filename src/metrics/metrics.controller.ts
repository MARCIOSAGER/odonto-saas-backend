import { Controller, Get, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeEndpoint,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { register } from 'prom-client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('metrics')
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
@ApiBearerAuth('JWT-auth')
export class MetricsController {
  @Get()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Metrics in Prometheus format' })
  async getMetrics() {
    return register.metrics();
  }
}
