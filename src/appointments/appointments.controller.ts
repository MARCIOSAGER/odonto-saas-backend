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
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('appointments')
@Controller('appointments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List all appointments of the clinic' })
  @ApiResponse({ status: 200, description: 'Appointments list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Filter by date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'dentist_id', required: false, type: String })
  @ApiQuery({ name: 'patient_id', required: false, type: String })
  async findAll(
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('dentist_id') dentistId?: string,
    @Query('patient_id') patientId?: string,
  ) {
    return this.appointmentsService.findAll(user.clinicId, {
      page,
      limit,
      date,
      status,
      dentistId,
      patientId,
    });
  }

  @Get('today')
  @ApiOperation({ summary: 'Get today appointments' })
  @ApiResponse({ status: 200, description: 'Today appointments' })
  async getToday(@CurrentUser() user: { clinicId: string }) {
    return this.appointmentsService.getToday(user.clinicId);
  }

  @Get('available-slots')
  @ApiOperation({ summary: 'Get available time slots for a date' })
  @ApiResponse({ status: 200, description: 'Available slots' })
  @ApiQuery({ name: 'date', required: true, type: String, description: 'Date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dentist_id', required: false, type: String })
  @ApiQuery({ name: 'service_id', required: false, type: String })
  async getAvailableSlots(
    @CurrentUser() user: { clinicId: string },
    @Query('date') date: string,
    @Query('dentist_id') dentistId?: string,
    @Query('service_id') serviceId?: string,
  ) {
    return this.appointmentsService.getAvailableSlots(user.clinicId, date, dentistId, serviceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new appointment' })
  @ApiResponse({ status: 201, description: 'Appointment created' })
  @ApiResponse({ status: 409, description: 'Time slot not available' })
  async create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.appointmentsService.create(user.clinicId, createAppointmentDto, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  @ApiResponse({ status: 200, description: 'Appointment found' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.appointmentsService.findOne(user.clinicId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update appointment' })
  @ApiResponse({ status: 200, description: 'Appointment updated' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.appointmentsService.update(user.clinicId, id, updateAppointmentDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel appointment' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.appointmentsService.cancel(user.clinicId, id, reason, user.userId);
  }

  @Put(':id/confirm')
  @ApiOperation({ summary: 'Confirm appointment' })
  @ApiResponse({ status: 200, description: 'Appointment confirmed' })
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.appointmentsService.confirm(user.clinicId, id, user.userId);
  }

  @Put(':id/complete')
  @ApiOperation({ summary: 'Mark appointment as completed' })
  @ApiResponse({ status: 200, description: 'Appointment completed' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.appointmentsService.complete(user.clinicId, id, notes, user.userId);
  }
}
