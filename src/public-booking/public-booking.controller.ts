import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PublicBookingService } from './public-booking.service';
import { CreatePublicBookingDto, AvailableSlotsQueryDto } from './dto';

@ApiTags('public-booking')
@Controller('booking')
export class PublicBookingController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Get(':slug')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get clinic info for public booking page' })
  @ApiParam({ name: 'slug', description: 'Clinic slug' })
  @ApiResponse({ status: 200, description: 'Clinic info for booking' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  @ApiResponse({ status: 403, description: 'Public booking disabled' })
  async getClinicInfo(@Param('slug') slug: string) {
    return this.publicBookingService.getClinicBySlug(slug);
  }

  @Get(':slug/services')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get available services for booking' })
  @ApiParam({ name: 'slug', description: 'Clinic slug' })
  @ApiResponse({ status: 200, description: 'List of active services' })
  async getServices(@Param('slug') slug: string) {
    const clinic = await this.publicBookingService.getClinicBySlug(slug);
    return this.publicBookingService.getServices(clinic.id);
  }

  @Get(':slug/dentists')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get available dentists for booking' })
  @ApiParam({ name: 'slug', description: 'Clinic slug' })
  @ApiResponse({ status: 200, description: 'List of active dentists' })
  async getDentists(@Param('slug') slug: string) {
    const clinic = await this.publicBookingService.getClinicBySlug(slug);
    return this.publicBookingService.getDentists(clinic.id);
  }

  @Get(':slug/available-slots')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Get available time slots for a date' })
  @ApiParam({ name: 'slug', description: 'Clinic slug' })
  @ApiResponse({ status: 200, description: 'Available time slots' })
  async getAvailableSlots(@Param('slug') slug: string, @Query() query: AvailableSlotsQueryDto) {
    const clinic = await this.publicBookingService.getClinicBySlug(slug);
    return this.publicBookingService.getAvailableSlots(
      clinic.id,
      query.date,
      query.serviceId,
      query.dentistId,
    );
  }

  @Post(':slug/book')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a public booking' })
  @ApiParam({ name: 'slug', description: 'Clinic slug' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 409, description: 'Time slot already taken' })
  async createBooking(@Param('slug') slug: string, @Body() dto: CreatePublicBookingDto) {
    const clinic = await this.publicBookingService.getClinicBySlug(slug);
    return this.publicBookingService.createBooking(clinic.id, dto);
  }
}
