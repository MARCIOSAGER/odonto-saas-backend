import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HofConsentService, CreateHofConsentDto, SignHofConsentDto } from './hof-consent.service';

interface UserPayload {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

@ApiTags('hof-consent')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class HofConsentController {
  constructor(private readonly consentService: HofConsentService) {}

  @Get('hof-sessions/:sessionId/consent')
  @ApiOperation({ summary: 'Get consent form for a session' })
  async findBySession(@CurrentUser() user: UserPayload, @Param('sessionId') sessionId: string) {
    return this.consentService.findBySession(user.clinicId, sessionId);
  }

  @Post('hof-sessions/:sessionId/consent')
  @ApiOperation({ summary: 'Create consent form for a session' })
  async create(
    @CurrentUser() user: UserPayload,
    @Param('sessionId') sessionId: string,
    @Body() dto?: CreateHofConsentDto,
  ) {
    return this.consentService.create(user.clinicId, sessionId, user.userId, dto);
  }

  @Post('hof-consent/:id/sign')
  @ApiOperation({ summary: 'Sign a consent form' })
  async sign(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: SignHofConsentDto,
  ) {
    return this.consentService.sign(user.clinicId, id, user.userId, dto);
  }

  @Get('hof/consent-template')
  @ApiOperation({ summary: 'Get the default consent template' })
  async getDefaultTemplate() {
    return this.consentService.getDefaultTemplate();
  }
}
