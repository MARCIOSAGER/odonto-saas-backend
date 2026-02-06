import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FaceogramService, CreateFaceogramEntryDto, SupersedeEntryDto } from './faceogram.service';
import { FacialRegion, HofProcedureType } from '@prisma/client';

interface UserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

@ApiTags('faceogram')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class FaceogramController {
  constructor(private readonly faceogramService: FaceogramService) {}

  @Get('patients/:patientId/faceogram')
  @ApiOperation({ summary: 'Get or create faceogram for a patient' })
  async getOrCreate(@CurrentUser() user: UserPayload, @Param('patientId') patientId: string) {
    return this.faceogramService.getOrCreate(user.clinicId, patientId, user.userId);
  }

  @Post('patients/:patientId/faceogram/entries')
  @ApiOperation({ summary: 'Create a new faceogram entry' })
  async createEntry(
    @CurrentUser() user: UserPayload,
    @Param('patientId') patientId: string,
    @Body() dto: CreateFaceogramEntryDto,
  ) {
    // First get/create faceogram
    const faceogram = await this.faceogramService.getOrCreate(
      user.clinicId,
      patientId,
      user.userId,
    );

    return this.faceogramService.createEntry(user.clinicId, user.userId, faceogram.id, dto);
  }

  @Patch('faceogram/entries/:entryId/supersede')
  @ApiOperation({ summary: 'Supersede (correct) a faceogram entry' })
  async supersedeEntry(
    @CurrentUser() user: UserPayload,
    @Param('entryId') entryId: string,
    @Body() dto: SupersedeEntryDto,
  ) {
    return this.faceogramService.supersedeEntry(user.clinicId, user.userId, entryId, dto);
  }

  @Delete('faceogram/entries/:entryId')
  @ApiOperation({ summary: 'Delete a faceogram entry (soft delete)' })
  async deleteEntry(@CurrentUser() user: UserPayload, @Param('entryId') entryId: string) {
    return this.faceogramService.deleteEntry(user.clinicId, user.userId, entryId);
  }

  @Get('patients/:patientId/faceogram/history')
  @ApiOperation({ summary: 'Get faceogram entry history with filters' })
  async getHistory(
    @CurrentUser() user: UserPayload,
    @Param('patientId') patientId: string,
    @Query('facialRegion') facialRegion?: FacialRegion,
    @Query('procedureType') procedureType?: HofProcedureType,
    @Query('includeSuperseded') includeSuperseded?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.faceogramService.getHistory(user.clinicId, patientId, {
      facialRegion,
      procedureType,
      includeSuperseded: includeSuperseded === 'true',
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('hof-sessions/:sessionId/faceogram')
  @ApiOperation({ summary: 'Get faceogram entries for a specific session' })
  async getBySession(@CurrentUser() user: UserPayload, @Param('sessionId') sessionId: string) {
    return this.faceogramService.getBySession(user.clinicId, sessionId);
  }
}
