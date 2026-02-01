import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
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
import {
  PrescriptionsService,
  CreatePrescriptionDto,
} from './prescriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('prescriptions')
@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create prescription/certificate/referral' })
  @ApiResponse({ status: 201, description: 'Prescription created' })
  async create(
    @CurrentUser() user: { clinicId: string },
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.prescriptionsService.create(user.clinicId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all prescriptions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prescriptionsService.findAll(
      user.clinicId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List prescriptions for a patient' })
  async findByPatient(
    @CurrentUser() user: { clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.prescriptionsService.findByPatient(user.clinicId, patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get prescription by ID' })
  async findById(
    @CurrentUser() user: { clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prescriptionsService.findById(user.clinicId, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Mark prescription as sent' })
  async markAsSent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { via: string },
  ) {
    return this.prescriptionsService.markAsSent(id, body.via);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete prescription' })
  async delete(
    @CurrentUser() user: { clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prescriptionsService.delete(user.clinicId, id);
  }
}
