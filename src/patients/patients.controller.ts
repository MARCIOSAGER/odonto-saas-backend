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
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('patients')
@Controller('patients')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'List all patients of the clinic' })
  @ApiResponse({ status: 200, description: 'Patients list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.patientsService.findAll(user.clinicId, { page, limit, search, status });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new patient' })
  @ApiResponse({ status: 201, description: 'Patient created' })
  @ApiResponse({ status: 409, description: 'Patient with this phone already exists' })
  async create(
    @Body() createPatientDto: CreatePatientDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.patientsService.create(user.clinicId, createPatientDto, user.userId);
  }

  @Get('phone/:phone')
  @ApiOperation({ summary: 'Find patient by phone number' })
  @ApiResponse({ status: 200, description: 'Patient found' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async findByPhone(@Param('phone') phone: string, @CurrentUser() user: { clinicId: string }) {
    return this.patientsService.findByPhone(user.clinicId, phone);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by ID' })
  @ApiResponse({ status: 200, description: 'Patient found' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { clinicId: string }) {
    return this.patientsService.findOne(user.clinicId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update patient' })
  @ApiResponse({ status: 200, description: 'Patient updated' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.patientsService.update(user.clinicId, id, updatePatientDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate patient' })
  @ApiResponse({ status: 200, description: 'Patient deactivated' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.patientsService.remove(user.clinicId, id, user.userId);
  }

  @Get(':id/appointments')
  @ApiOperation({ summary: 'Get patient appointments history' })
  @ApiResponse({ status: 200, description: 'Patient appointments' })
  async getAppointments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { clinicId: string },
    @Query('limit') limit?: number,
  ) {
    return this.patientsService.getAppointments(user.clinicId, id, limit);
  }
}
