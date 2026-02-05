import { Controller, Get, Put, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AutomationsService } from './automations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('automations')
@Controller('automations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all automations for current clinic' })
  @ApiResponse({ status: 200, description: 'Automations list' })
  async findAll(@CurrentUser() user: { clinicId: string }) {
    return this.automationsService.findAll(user.clinicId);
  }

  @Get(':type')
  @ApiOperation({ summary: 'Get automation by type' })
  @ApiResponse({ status: 200, description: 'Automation details' })
  async findByType(@CurrentUser() user: { clinicId: string }, @Param('type') type: string) {
    return this.automationsService.findByType(user.clinicId, type);
  }

  @Put(':type')
  @ApiOperation({ summary: 'Create or update automation by type' })
  @ApiResponse({ status: 200, description: 'Automation saved' })
  async upsert(
    @CurrentUser() user: { clinicId: string },
    @Param('type') type: string,
    @Body()
    body: {
      name: string;
      trigger_type: string;
      trigger_config: Record<string, unknown>;
      action_type: string;
      action_config: Record<string, unknown>;
      is_active: boolean;
    },
  ) {
    return this.automationsService.upsertByType(user.clinicId, type, body);
  }

  @Patch(':type/toggle')
  @ApiOperation({ summary: 'Toggle automation on/off' })
  @ApiResponse({ status: 200, description: 'Automation toggled' })
  async toggle(
    @CurrentUser() user: { clinicId: string },
    @Param('type') type: string,
    @Body() body: { is_active: boolean },
  ) {
    return this.automationsService.toggle(user.clinicId, type, body.is_active);
  }
}
