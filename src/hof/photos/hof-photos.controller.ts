import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HofPhotosService, UpdateHofPhotoDto } from './hof-photos.service';
import { StorageService } from '../../storage/storage.service';
import { imageFileFilter, memoryStorageConfig } from '../../common/utils/upload.util';
import { getStorageKey } from '../../common/utils/upload.util';

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
  constructor(
    private readonly photosService: HofPhotosService,
    private readonly storageService: StorageService,
  ) {}

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
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorageConfig(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async create(
    @CurrentUser() user: UserPayload,
    @Param('patientId') patientId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { photo_type?: string; session_id?: string },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const photoType = (body.photo_type || 'before').toLowerCase();
    if (!['before', 'after', 'progress'].includes(photoType)) {
      throw new BadRequestException('photo_type must be "before", "after" or "progress"');
    }

    const key = getStorageKey('hof-photos', file.originalname);
    const fileUrl = await this.storageService.upload(file.buffer, key, file.mimetype);

    return this.photosService.create(user.clinicId, patientId, user.userId, {
      photoType: photoType as 'before' | 'after',
      fileUrl,
      sessionId: body.session_id || undefined,
    });
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
