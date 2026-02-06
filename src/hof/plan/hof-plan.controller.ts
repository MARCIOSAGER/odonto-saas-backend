import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HofPlanService, CreateHofPlanItemDto, UpdateHofPlanItemDto } from './hof-plan.service';

interface UserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

@ApiTags('hof-plan')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class HofPlanController {
  constructor(private readonly planService: HofPlanService) {}

  @Get('patients/:patientId/hof-plan')
  @ApiOperation({ summary: 'Get all HOF plan items for a patient' })
  async findByPatient(@CurrentUser() user: UserPayload, @Param('patientId') patientId: string) {
    return this.planService.findByPatient(user.clinicId, patientId);
  }

  @Get('patients/:patientId/hof-plan/total')
  @ApiOperation({ summary: 'Calculate total value of HOF plan' })
  async calculateTotal(@CurrentUser() user: UserPayload, @Param('patientId') patientId: string) {
    return this.planService.calculateTotal(user.clinicId, patientId);
  }

  @Post('patients/:patientId/hof-plan')
  @ApiOperation({ summary: 'Create a new HOF plan item' })
  async create(
    @CurrentUser() user: UserPayload,
    @Param('patientId') patientId: string,
    @Body() dto: CreateHofPlanItemDto,
  ) {
    return this.planService.create(user.clinicId, patientId, user.userId, dto);
  }

  @Put('hof-plan/:id')
  @ApiOperation({ summary: 'Update a HOF plan item' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateHofPlanItemDto,
  ) {
    return this.planService.update(user.clinicId, id, user.userId, dto);
  }

  @Post('hof-plan/:id/complete')
  @ApiOperation({ summary: 'Mark a HOF plan item as completed and link to session' })
  async complete(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() body: { sessionId: string },
  ) {
    return this.planService.complete(user.clinicId, id, user.userId, body.sessionId);
  }

  @Delete('hof-plan/:id')
  @ApiOperation({ summary: 'Delete a HOF plan item' })
  async delete(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.planService.delete(user.clinicId, id, user.userId);
  }
}
