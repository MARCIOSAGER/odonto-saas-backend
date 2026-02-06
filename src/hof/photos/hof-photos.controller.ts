import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HofPhotosService, CreateHofPhotoDto, UpdateHofPhotoDto } from './hof-photos.service';

interface UserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

@ApiTags('hof-photos')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class HofPhotosController {
  constructor(private readonly photosService: HofPhotosService) {}

  @Get('patients/:patientId/hof-photos')
  @ApiOperation({ summary: 'Get all HOF photos for a patient' })
  async findByPatient(@CurrentUser() user: UserPayload, @Param('patientId') patientId: string) {
    return this.photosService.findByPatient(user.clinicId, patientId);
  }

  @Get('hof-sessions/:sessionId/photos')
  @ApiOperation({ summary: 'Get photos for a specific session' })
  async findBySession(@CurrentUser() user: UserPayload, @Param('sessionId') sessionId: string) {
    return this.photosService.findBySession(user.clinicId, sessionId);
  }

  @Post('patients/:patientId/hof-photos')
  @ApiOperation({ summary: 'Upload a new HOF photo' })
  async create(
    @CurrentUser() user: UserPayload,
    @Param('patientId') patientId: string,
    @Body() dto: CreateHofPhotoDto,
  ) {
    return this.photosService.create(user.clinicId, patientId, user.userId, dto);
  }

  @Put('hof-photos/:id/annotations')
  @ApiOperation({ summary: 'Update photo annotations' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateHofPhotoDto,
  ) {
    return this.photosService.update(user.clinicId, id, user.userId, dto);
  }

  @Delete('hof-photos/:id')
  @ApiOperation({ summary: 'Delete a HOF photo' })
  async delete(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.photosService.delete(user.clinicId, id, user.userId);
  }
}
