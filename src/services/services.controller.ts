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
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('services')
@Controller('services')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
@Permissions('services:manage')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @ApiOperation({ summary: 'List all services of the clinic' })
  @ApiResponse({ status: 200, description: 'Services list' })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(@CurrentUser() user: { clinicId: string }, @Query('status') status?: string) {
    return this.servicesService.findAll(user.clinicId, { status });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new service' })
  @ApiResponse({ status: 201, description: 'Service created' })
  @ApiResponse({ status: 409, description: 'Service name already exists' })
  async create(
    @Body() createServiceDto: CreateServiceDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.servicesService.create(user.clinicId, createServiceDto, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get service by ID' })
  @ApiResponse({ status: 200, description: 'Service found' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { clinicId: string }) {
    return this.servicesService.findOne(user.clinicId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update service' })
  @ApiResponse({ status: 200, description: 'Service updated' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateServiceDto: UpdateServiceDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.servicesService.update(user.clinicId, id, updateServiceDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate service' })
  @ApiResponse({ status: 200, description: 'Service deactivated' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.servicesService.remove(user.clinicId, id, user.userId);
  }
}
