import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NpsService } from './nps.service';
import { RespondNpsDto } from './dto/respond-nps.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('nps')
@Controller('nps')
export class NpsController {
  constructor(private readonly npsService: NpsService) {}

  // ── Public endpoints (patient responds to survey) ──

  @Public()
  @Get('survey/:surveyId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Get NPS survey details (public)' })
  async getSurvey(@Param('surveyId', ParseUUIDPipe) surveyId: string) {
    return this.npsService.getSurveyById(surveyId);
  }

  @Public()
  @Post('respond/:surveyId')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit NPS survey response (public)' })
  @ApiResponse({ status: 200, description: 'Response recorded' })
  async respond(@Param('surveyId', ParseUUIDPipe) surveyId: string, @Body() body: RespondNpsDto) {
    return this.npsService.respond(surveyId, body.score, body.feedback);
  }

  // ── Authenticated endpoints (clinic staff) ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('send/:appointmentId')
  @ApiOperation({ summary: 'Send NPS survey for an appointment' })
  async send(
    @CurrentUser() user: { clinicId: string },
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.npsService.sendSurvey(user.clinicId, appointmentId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('stats')
  @ApiOperation({ summary: 'Get NPS statistics' })
  @ApiQuery({ name: 'start', required: false })
  @ApiQuery({ name: 'end', required: false })
  async getStats(
    @CurrentUser() user: { clinicId: string },
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    return this.npsService.getStats(user.clinicId, startDate, endDate);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('responses')
  @ApiOperation({ summary: 'List NPS responses' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getResponses(
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.npsService.getResponses(
      user.clinicId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
