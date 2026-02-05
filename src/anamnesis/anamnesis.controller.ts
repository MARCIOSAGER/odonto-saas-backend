import { Controller, Get, Post, Put, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AnamnesisService } from './anamnesis.service';
import { CreateAnamnesisDto } from './dto/create-anamnesis.dto';
import { UpdateAnamnesisDto } from './dto/update-anamnesis.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('anamnesis')
@Controller('anamnesis')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AnamnesisController {
  constructor(private readonly anamnesisService: AnamnesisService) {}

  @Post()
  @ApiOperation({ summary: 'Create anamnesis for a patient' })
  @ApiResponse({ status: 201, description: 'Anamnesis created' })
  async create(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Body() dto: CreateAnamnesisDto,
  ) {
    return this.anamnesisService.create(user.clinicId, user.userId, dto);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List all anamnesis records for a patient' })
  async findByPatient(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.anamnesisService.findByPatient(user.clinicId, patientId);
  }

  @Get('patient/:patientId/latest')
  @ApiOperation({ summary: 'Get latest anamnesis for a patient' })
  async findLatest(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.anamnesisService.findLatest(user.clinicId, patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get anamnesis by ID' })
  async findById(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.anamnesisService.findById(user.clinicId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update anamnesis' })
  async update(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnamnesisDto,
  ) {
    return this.anamnesisService.update(user.clinicId, id, dto, user.userId);
  }
}
