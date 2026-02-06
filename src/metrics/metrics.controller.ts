import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { register } from 'prom-client';

@ApiTags('metrics')
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
@SkipThrottle()
export class MetricsController {
  @Get()
  @ApiExcludeEndpoint() // Hide from Swagger in production
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Metrics in Prometheus format' })
  async getMetrics() {
    return register.metrics();
  }
}
