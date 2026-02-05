import { Controller, Post, Get, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiClinicalService } from './ai-clinical.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('ai-clinical')
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AiClinicalController {
  constructor(private readonly aiClinicalService: AiClinicalService) {}

  @Post('clinical-notes')
  @ApiOperation({ summary: 'Generate structured clinical notes from free text' })
  @ApiResponse({ status: 200, description: 'Structured clinical notes' })
  async generateClinicalNotes(
    @CurrentUser() user: { clinicId: string },
    @Body()
    body: {
      freeText: string;
      patientId?: string;
      appointmentId?: string;
    },
  ) {
    return this.aiClinicalService.generateClinicalNotes(user.clinicId, body);
  }

  @Post('treatment-plan/:patientId')
  @ApiOperation({ summary: 'Suggest treatment plan based on odontogram and history' })
  @ApiResponse({ status: 200, description: 'Treatment plan suggestion' })
  async suggestTreatmentPlan(
    @CurrentUser() user: { clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.aiClinicalService.suggestTreatmentPlan(user.clinicId, patientId);
  }

  @Get('patient-summary/:patientId')
  @ApiOperation({ summary: 'Get AI-generated patient summary' })
  @ApiResponse({ status: 200, description: 'Patient summary' })
  async getPatientSummary(
    @CurrentUser() user: { clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.aiClinicalService.getPatientSummary(user.clinicId, patientId);
  }

  @Post('anamnesis')
  @ApiOperation({ summary: 'Process anamnesis answers with AI' })
  @ApiResponse({ status: 200, description: 'Structured anamnesis report' })
  async processAnamnesis(
    @CurrentUser() user: { clinicId: string },
    @Body()
    body: {
      patientId?: string;
      answers: Record<string, string>;
    },
  ) {
    return this.aiClinicalService.processAnamnesis(user.clinicId, body);
  }
}
