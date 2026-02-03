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
import { DentistsService } from './dentists.service';
import { CreateDentistDto } from './dto/create-dentist.dto';
import { UpdateDentistDto } from './dto/update-dentist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@ApiTags('dentists')
@Controller('dentists')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
@Permissions('dentists:manage')
export class DentistsController {
  constructor(private readonly dentistsService: DentistsService) {}

  @Get()
  @ApiOperation({ summary: 'List all dentists of the clinic' })
  @ApiResponse({ status: 200, description: 'Dentists list' })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(@CurrentUser() user: { clinicId: string }, @Query('status') status?: string) {
    return this.dentistsService.findAll(user.clinicId, { status });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new dentist' })
  @ApiResponse({ status: 201, description: 'Dentist created' })
  @ApiResponse({ status: 409, description: 'CRO already exists' })
  async create(
    @Body() createDentistDto: CreateDentistDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.dentistsService.create(user.clinicId, createDentistDto, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dentist by ID' })
  @ApiResponse({ status: 200, description: 'Dentist found' })
  @ApiResponse({ status: 404, description: 'Dentist not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { clinicId: string }) {
    return this.dentistsService.findOne(user.clinicId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update dentist' })
  @ApiResponse({ status: 200, description: 'Dentist updated' })
  @ApiResponse({ status: 404, description: 'Dentist not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDentistDto: UpdateDentistDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.dentistsService.update(user.clinicId, id, updateDentistDto, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate dentist' })
  @ApiResponse({ status: 200, description: 'Dentist deactivated' })
  @ApiResponse({ status: 404, description: 'Dentist not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.dentistsService.remove(user.clinicId, id, user.userId);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted dentist' })
  @ApiResponse({ status: 200, description: 'Dentist restored' })
  @ApiResponse({ status: 404, description: 'Dentist not found or not deleted' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.dentistsService.restore(user.clinicId, id, user.userId);
  }
}
