import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { memoryStorageConfig, imageFileFilter, getStorageKey } from '../common/utils/upload.util';
import { StorageService } from '../storage/storage.service';

@ApiTags('clinics')
@Controller('clinics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ClinicsController {
  constructor(
    private readonly clinicsService: ClinicsService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'List all clinics (superadmin) or own clinic (admin)' })
  @ApiResponse({ status: 200, description: 'Clinics list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  async findAll(
    @CurrentUser() user: { userId: string; clinicId: string; role: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    if (user.role === 'superadmin') {
      return this.clinicsService.findAll({ page, limit, status });
    }
    return this.clinicsService.findOne(user.clinicId);
  }

  @Post()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a new clinic (superadmin only)' })
  @ApiResponse({ status: 201, description: 'Clinic created' })
  @ApiResponse({ status: 409, description: 'CNPJ already exists' })
  async create(@Body() createClinicDto: CreateClinicDto, @CurrentUser() user: { userId: string }) {
    return this.clinicsService.create(createClinicDto, user.userId);
  }

  @Get('my/stats')
  @ApiOperation({ summary: 'Get current clinic statistics from JWT token' })
  @ApiResponse({ status: 200, description: 'Clinic statistics' })
  async getMyStats(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.getStats(user.clinicId);
  }

  @Get('my/profile')
  @ApiOperation({ summary: 'Get current clinic profile from JWT token' })
  @ApiResponse({ status: 200, description: 'Clinic profile' })
  async getMyProfile(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.findOne(user.clinicId);
  }

  @Put('my/profile')
  @ApiOperation({ summary: 'Update current clinic profile' })
  @ApiResponse({ status: 200, description: 'Clinic updated' })
  async updateMyProfile(
    @Body() updateClinicDto: UpdateClinicDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.clinicsService.update(user.clinicId, updateClinicDto, user.userId);
  }

  @Post('my/upload-logo')
  @ApiOperation({ summary: 'Upload clinic logo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Logo uploaded successfully' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorageConfig(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadMyLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const key = getStorageKey('logos', file.originalname);
    const logoUrl = await this.storageService.upload(file.buffer, key, file.mimetype);
    await this.clinicsService.update(user.clinicId, { logo_url: logoUrl }, user.userId);
    return { logo_url: logoUrl };
  }

  @Post('my/upload-favicon')
  @ApiOperation({ summary: 'Upload clinic favicon' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Favicon uploaded successfully' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorageConfig(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
    }),
  )
  async uploadMyFavicon(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const key = getStorageKey('favicons', file.originalname);
    const faviconUrl = await this.storageService.upload(file.buffer, key, file.mimetype);
    await this.clinicsService.update(user.clinicId, { favicon_url: faviconUrl }, user.userId);
    return { favicon_url: faviconUrl };
  }

  @Get('my/ai-settings')
  @ApiOperation({ summary: 'Get AI assistant settings for current clinic' })
  @ApiResponse({ status: 200, description: 'AI settings retrieved' })
  async getMyAiSettings(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.getAiSettings(user.clinicId);
  }

  @Put('my/ai-settings')
  @ApiOperation({ summary: 'Update AI assistant settings for current clinic' })
  @ApiResponse({ status: 200, description: 'AI settings updated' })
  async updateMyAiSettings(
    @Body() updateAiSettingsDto: UpdateAiSettingsDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.clinicsService.updateAiSettings(user.clinicId, updateAiSettingsDto, user.userId);
  }

  @Post('my/test-ai')
  @ApiOperation({ summary: 'Test AI provider connection for current clinic' })
  @ApiResponse({ status: 200, description: 'AI connection test result' })
  async testAiConnection(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.testAiConnection(user.clinicId);
  }

  @Post('my/test-whatsapp')
  @ApiOperation({ summary: 'Test WhatsApp connection for current clinic' })
  @ApiResponse({ status: 200, description: 'WhatsApp connection status' })
  async testWhatsAppConnection(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.testWhatsAppConnection(user.clinicId);
  }

  @Get('my/whatsapp-qrcode')
  @ApiOperation({ summary: 'Get WhatsApp QR Code for current clinic instance' })
  @ApiResponse({ status: 200, description: 'QR Code image data' })
  async getWhatsAppQrCode(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.getWhatsAppQrCode(user.clinicId);
  }

  @Post('my/send-test-whatsapp')
  @ApiOperation({ summary: 'Send a test WhatsApp message to a phone number' })
  @ApiResponse({ status: 200, description: 'Test message sent' })
  async sendTestWhatsAppMessage(
    @Body() body: { phone: string },
    @CurrentUser() user: { clinicId: string },
  ) {
    return this.clinicsService.sendTestWhatsAppMessage(user.clinicId, body.phone);
  }

  @Post('my/whatsapp-disconnect')
  @ApiOperation({ summary: 'Disconnect WhatsApp instance' })
  @ApiResponse({ status: 200, description: 'WhatsApp disconnected' })
  async disconnectWhatsApp(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.disconnectWhatsApp(user.clinicId);
  }

  @Post('my/whatsapp-restart')
  @ApiOperation({ summary: 'Restart WhatsApp instance (no QR needed)' })
  @ApiResponse({ status: 200, description: 'WhatsApp restarted' })
  async restartWhatsApp(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.restartWhatsApp(user.clinicId);
  }

  @Post('my/whatsapp-restore')
  @ApiOperation({ summary: 'Restore WhatsApp session from saved data' })
  @ApiResponse({ status: 200, description: 'Session restored' })
  async restoreWhatsAppSession(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.restoreWhatsAppSession(user.clinicId);
  }

  @Get('my/email-settings')
  @ApiOperation({ summary: 'Get email/SMTP settings for current clinic' })
  @ApiResponse({ status: 200, description: 'Email settings retrieved' })
  async getMyEmailSettings(@CurrentUser() user: { clinicId: string }) {
    return this.clinicsService.getEmailSettings(user.clinicId);
  }

  @Put('my/email-settings')
  @ApiOperation({ summary: 'Update email/SMTP settings for current clinic' })
  @ApiResponse({ status: 200, description: 'Email settings updated' })
  async updateMyEmailSettings(
    @Body() updateEmailSettingsDto: UpdateEmailSettingsDto,
    @CurrentUser() user: { userId: string; clinicId: string },
  ) {
    return this.clinicsService.updateEmailSettings(
      user.clinicId,
      updateEmailSettingsDto,
      user.userId,
    );
  }

  @Post('my/test-email')
  @ApiOperation({ summary: 'Send a test email to the current user' })
  @ApiResponse({ status: 200, description: 'Test email result' })
  async testEmailConnection(@CurrentUser() user: { userId: string; clinicId: string }) {
    return this.clinicsService.testEmailConnection(user.clinicId, user.userId);
  }

  @Get('public/branding/:slug')
  @Public()
  @ApiOperation({ summary: 'Get clinic public branding by slug (no auth required)' })
  @ApiResponse({ status: 200, description: 'Clinic branding data' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  async getPublicBranding(@Param('slug') slug: string) {
    return this.clinicsService.findPublicBrandingBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clinic by ID' })
  @ApiResponse({ status: 200, description: 'Clinic found' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { clinicId: string; role: string },
  ) {
    if (user.role !== 'superadmin' && user.clinicId !== id) {
      return this.clinicsService.findOne(user.clinicId);
    }
    return this.clinicsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update clinic' })
  @ApiResponse({ status: 200, description: 'Clinic updated' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClinicDto: UpdateClinicDto,
    @CurrentUser() user: { userId: string; clinicId: string; role: string },
  ) {
    const clinicId = user.role === 'superadmin' ? id : user.clinicId;
    return this.clinicsService.update(clinicId, updateClinicDto, user.userId);
  }

  @Delete(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Delete clinic (superadmin only)' })
  @ApiResponse({ status: 200, description: 'Clinic deleted' })
  @ApiResponse({ status: 404, description: 'Clinic not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: { userId: string }) {
    return this.clinicsService.remove(id, user.userId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get clinic statistics' })
  @ApiResponse({ status: 200, description: 'Clinic statistics' })
  async getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { clinicId: string; role: string },
  ) {
    const clinicId = user.role === 'superadmin' ? id : user.clinicId;
    return this.clinicsService.getStats(clinicId);
  }
}
