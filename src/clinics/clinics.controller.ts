import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('clinics')
@Controller('clinics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get()
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'List all clinics (superadmin) or own clinic (admin)' })
  @ApiResponse({ status: 200, description: 'Clinics list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(
    @CurrentUser() user: { userId: string; clinicId: string; role: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    if (user.role === 'superadmin') {
      return this.clinicsService.findAll({ page, limit, status });
    }
    return this.clinicsService.findOne(user.clinicId);
  }

  @Post()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a new clinic (superadmin only)' })
  @ApiResponse({ status: 201, description: 'Clinic created' })
  @ApiResponse({ status: 409, description: 'CNPJ already exists' })
  async create(
    @Body() createClinicDto: CreateClinicDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.clinicsService.create(createClinicDto, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clinic by ID' })
  @ApiResponse({ status: 200, description: 'Clinic found' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { clinicId: string; role: string },
  ) {
    if (user.role !== 'superadmin' && user.clinicId !== id) {
      return this.clinicsService.findOne(user.clinicId);
    }
    return this.clinicsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update clinic' })
  @ApiResponse({ status: 200, description: 'Clinic updated' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClinicDto: UpdateClinicDto,
    @CurrentUser() user: { userId: string; clinicId: string; role: string },
  ) {
    const clinicId = user.role === 'superadmin' ? id : user.clinicId;
    return this.clinicsService.update(clinicId, updateClinicDto, user.userId);
  }

  @Delete(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Delete clinic (superadmin only)' })
  @ApiResponse({ status: 200, description: 'Clinic deleted' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.clinicsService.remove(id, user.userId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get clinic statistics' })
  @ApiResponse({ status: 200, description: 'Clinic statistics' })
  async getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { clinicId: string; role: string },
  ) {
    const clinicId = user.role === 'superadmin' ? id : user.clinicId;
    return this.clinicsService.getStats(clinicId);
  }
}
