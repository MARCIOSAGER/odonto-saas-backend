import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
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
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { SystemConfigService } from './system-config.service';
import { BulkUpsertSystemConfigDto } from './dto/bulk-upsert-system-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { storageConfig, imageFileFilter } from '../common/utils/upload.util';

@ApiTags('system-config')
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Get all public system configs (platform branding)' })
  @ApiResponse({ status: 200, description: 'Public config key-value map' })
  async findAllPublic() {
    return this.systemConfigService.findAllPublic();
  }

  @Get('category/:category')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all system configs by category (superadmin)' })
  async findByCategory(@Param('category') category: string) {
    return this.systemConfigService.findByCategory(category);
  }

  @Put('bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Bulk update system configs (superadmin)' })
  async bulkUpsert(
    @Body() dto: BulkUpsertSystemConfigDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.systemConfigService.bulkUpsert(dto.configs, user.userId);
  }

  @Post('upload-logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload platform logo (superadmin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: storageConfig('platform'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadPlatformLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { userId: string },
  ) {
    if (!file) throw new BadRequestException('File is required');
    const logoUrl = `/uploads/platform/${file.filename}`;
    await this.systemConfigService.upsert(
      'platform_logo_url',
      logoUrl,
      user.userId,
    );
    return { logo_url: logoUrl };
  }

  @Post('upload-favicon')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload platform favicon (superadmin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: storageConfig('platform'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 1 * 1024 * 1024 },
    }),
  )
  async uploadPlatformFavicon(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { userId: string },
  ) {
    if (!file) throw new BadRequestException('File is required');
    const faviconUrl = `/uploads/platform/${file.filename}`;
    await this.systemConfigService.upsert(
      'platform_favicon_url',
      faviconUrl,
      user.userId,
    );
    return { favicon_url: faviconUrl };
  }
}
