import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  HofSessionsService,
  CreateHofSessionDto,
  UpdateHofSessionDto,
} from './hof-sessions.service';

interface UserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

@ApiTags('hof-sessions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class HofSessionsController {
  constructor(private readonly sessionsService: HofSessionsService) {}

  @Get('patients/:patientId/hof-sessions')
  @ApiOperation({ summary: 'Get all HOF sessions for a patient' })
  async findByPatient(@CurrentUser() user: UserPayload, @Param('patientId') patientId: string) {
    return this.sessionsService.findByPatient(user.clinicId, patientId);
  }

  @Get('hof-sessions/:id')
  @ApiOperation({ summary: 'Get a specific HOF session' })
  async findById(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.sessionsService.findById(user.clinicId, id);
  }

  @Post('patients/:patientId/hof-sessions')
  @ApiOperation({ summary: 'Create a new HOF session' })
  async create(
    @CurrentUser() user: UserPayload,
    @Param('patientId') patientId: string,
    @Body() dto: CreateHofSessionDto,
  ) {
    return this.sessionsService.create(user.clinicId, patientId, user.userId, dto);
  }

  @Put('hof-sessions/:id')
  @ApiOperation({ summary: 'Update a HOF session' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateHofSessionDto,
  ) {
    return this.sessionsService.update(user.clinicId, id, user.userId, dto);
  }

  @Delete('hof-sessions/:id')
  @ApiOperation({ summary: 'Delete a HOF session' })
  async delete(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.sessionsService.delete(user.clinicId, id, user.userId);
  }
}
