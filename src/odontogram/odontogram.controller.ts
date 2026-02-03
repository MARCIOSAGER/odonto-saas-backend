import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
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
  ApiParam,
} from '@nestjs/swagger';
import { DentitionType } from '@prisma/client';
import { OdontogramService } from './odontogram.service';
import { CreateEntryDto } from './dto/create-entry.dto';
import { SupersedeEntryDto } from './dto/supersede-entry.dto';
import { UpdateLegendDto } from './dto/update-legend.dto';
import { OdontogramQueryDto } from './dto/odontogram-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';

@ApiTags('odontogram')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
@Controller()
export class OdontogramController {
  constructor(private readonly odontogramService: OdontogramService) {}

  // ============================================
  // PATIENT ODONTOGRAM ROUTES
  // ============================================

  @Get('patients/:patientId/odontogram')
  @ApiOperation({ summary: 'Get or create patient odontogram' })
  @ApiResponse({ status: 200, description: 'Odontogram with active entries' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @ApiParam({ name: 'patientId', type: String, description: 'Patient UUID' })
  @ApiQuery({
    name: 'dentition_type',
    required: false,
    enum: DentitionType,
    description: 'Dentition type (PERMANENT, DECIDUOUS, MIXED)',
  })
  async getOrCreate(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: { userId: string; clinicId: string },
    @Query('dentition_type') dentitionType?: DentitionType,
  ) {
    return this.odontogramService.getOrCreate(
      user.clinicId,
      patientId,
      dentitionType,
    );
  }

  @Get('patients/:patientId/odontogram/history')
  @ApiOperation({ summary: 'Get odontogram entry history with filters' })
  @ApiResponse({ status: 200, description: 'Paginated entry history' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @ApiParam({ name: 'patientId', type: String, description: 'Patient UUID' })
  async getHistory(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: { userId: string; clinicId: string },
    @Query() query: OdontogramQueryDto,
  ) {
    return this.odontogramService.getHistory(
      user.clinicId,
      patientId,
      query,
    );
  }

  @Post('patients/:patientId/odontogram/entries')
  @ApiOperation({ summary: 'Create a new odontogram entry' })
  @ApiResponse({ status: 201, description: 'Entry created' })
  @ApiResponse({ status: 404, description: 'Odontogram or patient not found' })
  @ApiParam({ name: 'patientId', type: String, description: 'Patient UUID' })
  @Permissions('odontogram:write')
  async createEntry(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateEntryDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    const odontogram = await this.odontogramService.getOrCreate(
      user.clinicId,
      patientId,
    );
    return this.odontogramService.createEntry(
      user.clinicId,
      user.userId,
      odontogram.id,
      dto,
    );
  }

  @Patch('patients/:patientId/odontogram/entries/:entryId/supersede')
  @ApiOperation({ summary: 'Supersede an existing odontogram entry' })
  @ApiResponse({ status: 200, description: 'Entry superseded and new entry created' })
  @ApiResponse({ status: 400, description: 'Entry already superseded' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiParam({ name: 'patientId', type: String, description: 'Patient UUID' })
  @ApiParam({ name: 'entryId', type: String, description: 'Entry UUID to supersede' })
  @Permissions('odontogram:write')
  async supersedeEntry(
    @Param('patientId', ParseUUIDPipe) _patientId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: SupersedeEntryDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.odontogramService.supersedeEntry(
      user.clinicId,
      user.userId,
      entryId,
      dto,
    );
  }

  // ============================================
  // CLINIC LEGEND ROUTES
  // ============================================

  @Get('odontogram/legend')
  @ApiOperation({ summary: 'Get odontogram legend for the clinic' })
  @ApiResponse({ status: 200, description: 'Legend items list' })
  async getLegend(
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.odontogramService.getLegend(user.clinicId);
  }

  @Put('odontogram/legend')
  @ApiOperation({ summary: 'Create or update an odontogram legend item' })
  @ApiResponse({ status: 200, description: 'Legend item upserted' })
  @Permissions('settings:manage')
  async upsertLegend(
    @Body() dto: UpdateLegendDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.odontogramService.upsertLegend(user.clinicId, dto);
  }

  @Delete('odontogram/legend/:code')
  @ApiOperation({ summary: 'Soft-delete an odontogram legend item' })
  @ApiResponse({ status: 200, description: 'Legend item deactivated' })
  @ApiResponse({ status: 404, description: 'Legend item not found' })
  @ApiParam({ name: 'code', type: String, description: 'Legend item code' })
  @Permissions('settings:manage')
  async deleteLegend(
    @Param('code') code: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.odontogramService.deleteLegend(user.clinicId, code);
  }
}
