import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { Verify2faDto, Send2faCodeDto } from './dto/verify-2fa.dto';
import { SetupWhatsApp2faDto, VerifyTotpSetupDto, Disable2faDto } from './dto/setup-2fa.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user and clinic' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Email or CNPJ already exists' })
  async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
    return this.authService.register(registerDto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful or requires 2FA' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.login(loginDto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: { userId: string; clinicId: string }) {
    return this.authService.getProfile(user.userId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@CurrentUser() user: { userId: string }) {
    return { message: 'Logout successful' };
  }

  // ============================================
  // FORGOT PASSWORD
  // ============================================

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  // ============================================
  // GOOGLE OAUTH
  // ============================================

  @Post('google-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with Google OAuth' })
  @ApiResponse({ status: 200, description: 'Login successful or requires 2FA' })
  @ApiResponse({ status: 401, description: 'No account found or invalid token' })
  async googleLogin(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    return this.authService.googleLogin(dto.google_id_token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // ============================================
  // 2FA VERIFICATION (during login)
  // ============================================

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code and complete login' })
  @ApiResponse({ status: 200, description: '2FA verified, login complete' })
  @ApiResponse({ status: 401, description: 'Invalid code or token' })
  async verify2fa(@Body() dto: Verify2faDto, @Req() req: Request) {
    return this.authService.verify2fa(dto.two_factor_token, dto.code, dto.method, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('2fa/send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend 2FA code' })
  @ApiResponse({ status: 200, description: 'Code resent' })
  async resend2faCode(@Body() dto: Send2faCodeDto) {
    return this.authService.resend2faCode(dto.two_factor_token);
  }

  // ============================================
  // 2FA SETUP (authenticated)
  // ============================================

  @Post('2fa/setup/whatsapp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Setup WhatsApp 2FA' })
  @ApiResponse({ status: 200, description: 'WhatsApp 2FA enabled' })
  async setupWhatsApp2fa(
    @CurrentUser() user: { userId: string },
    @Body() dto: SetupWhatsApp2faDto,
  ) {
    return this.authService.setupWhatsApp2fa(user.userId, dto.phone);
  }

  @Post('2fa/setup/totp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Generate TOTP secret and QR code' })
  @ApiResponse({ status: 200, description: 'TOTP secret and QR code returned' })
  async setupTotp(@CurrentUser() user: { userId: string }) {
    return this.authService.setupTotp(user.userId);
  }

  @Post('2fa/setup/totp/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify TOTP setup with code' })
  @ApiResponse({ status: 200, description: 'TOTP 2FA enabled' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP code' })
  async verifyTotpSetup(
    @CurrentUser() user: { userId: string },
    @Body() dto: VerifyTotpSetupDto,
  ) {
    return this.authService.verifyTotpSetup(user.userId, dto.code, dto.secret);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Disable 2FA (requires password)' })
  @ApiResponse({ status: 200, description: '2FA disabled' })
  @ApiResponse({ status: 401, description: 'Wrong password' })
  async disable2fa(
    @CurrentUser() user: { userId: string },
    @Body() dto: Disable2faDto,
  ) {
    return this.authService.disable2fa(user.userId, dto.password);
  }

  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get 2FA status' })
  @ApiResponse({ status: 200, description: '2FA status' })
  async get2faStatus(@CurrentUser() user: { userId: string }) {
    return this.authService.get2faStatus(user.userId);
  }
}
