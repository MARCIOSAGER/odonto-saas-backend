import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TreatmentPlansService } from './treatment-plans.service';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('treatment-plans')
@Controller('treatment-plans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TreatmentPlansController {
  constructor(
    private readonly treatmentPlansService: TreatmentPlansService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a treatment plan' })
  @ApiResponse({ status: 201, description: 'Treatment plan created' })
  async create(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Body() dto: CreateTreatmentPlanDto,
  ) {
    return this.treatmentPlansService.create(
      user.clinicId,
      user.userId,
      dto,
    );
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List treatment plans for a patient' })
  @ApiResponse({ status: 200, description: 'Treatment plans list' })
  async findByPatient(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.treatmentPlansService.findByPatient(
      user.clinicId,
      patientId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get treatment plan by ID' })
  @ApiResponse({ status: 200, description: 'Treatment plan details' })
  async findById(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.treatmentPlansService.findById(user.clinicId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a treatment plan' })
  @ApiResponse({ status: 200, description: 'Treatment plan updated' })
  async update(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreatmentPlanDto,
  ) {
    return this.treatmentPlansService.update(
      user.clinicId,
      id,
      dto,
      user.userId,
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update treatment plan status' })
  @ApiResponse({ status: 200, description: 'Treatment plan status updated' })
  async updateStatus(
    @CurrentUser() user: { userId: string; clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: string },
  ) {
    return this.treatmentPlansService.updateStatus(
      user.clinicId,
      id,
      body.status,
      user.userId,
    );
  }
}
