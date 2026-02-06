import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HofAnamnesisService, CreateHofAnamnesisDto } from './hof-anamnesis.service';

interface UserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

@ApiTags('hof-anamnesis')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class HofAnamnesisController {
  constructor(private readonly anamnesisService: HofAnamnesisService) {}

  @Get('patients/:patientId/hof-anamnesis')
  @ApiOperation({ summary: 'Get all HOF anamnesis records for a patient' })
  async findByPatient(@CurrentUser() user: UserPayload, @Param('patientId') patientId: string) {
    return this.anamnesisService.findByPatient(user.clinicId, patientId);
  }

  @Get('patients/:patientId/hof-anamnesis/latest')
  @ApiOperation({ summary: 'Get the latest HOF anamnesis for a patient' })
  async findLatest(@CurrentUser() user: UserPayload, @Param('patientId') patientId: string) {
    return this.anamnesisService.findLatest(user.clinicId, patientId);
  }

  @Post('patients/:patientId/hof-anamnesis')
  @ApiOperation({ summary: 'Create a new HOF anamnesis record' })
  async create(
    @CurrentUser() user: UserPayload,
    @Param('patientId') patientId: string,
    @Body() dto: CreateHofAnamnesisDto,
  ) {
    return this.anamnesisService.create(user.clinicId, patientId, user.userId, dto);
  }

  @Put('hof-anamnesis/:id')
  @ApiOperation({ summary: 'Update an existing HOF anamnesis record' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateHofAnamnesisDto>,
  ) {
    return this.anamnesisService.update(user.clinicId, id, user.userId, dto);
  }
}
