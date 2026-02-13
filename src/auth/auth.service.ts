import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { RedisCacheService } from '../cache/cache.service';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const TOKEN_BLACKLIST_PREFIX = 'token:blacklist:';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly twoFactorService: TwoFactorService,
    private readonly cacheService: RedisCacheService,
  ) {}

  async register(registerDto: RegisterDto, meta?: RequestMeta) {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Check if CNPJ already exists
    const existingClinic = await this.prisma.clinic.findUnique({
      where: { cnpj: registerDto.cnpj },
    });

    if (existingClinic) {
      throw new ConflictException('CNPJ already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Create clinic and user in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: registerDto.clinic_name,
          cnpj: registerDto.cnpj,
          phone: registerDto.phone,
          email: registerDto.email,
          plan: 'basic',
          status: 'active',
        },
      });

      const user = await tx.user.create({
        data: {
          email: registerDto.email,
          password: hashedPassword,
          name: registerDto.name,
          role: 'admin',
          clinic_id: clinic.id,
          status: 'active',
        },
      });

      return { clinic, user };
    });

    // Audit log
    await this.auditService.log({
      action: 'REGISTER',
      entity: 'User',
      entityId: result.user.id,
      clinicId: result.clinic.id,
      userId: result.user.id,
      newValues: { email: result.user.email, clinicId: result.clinic.id },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    // Send welcome email (fire and forget, uses clinic SMTP if configured)
    this.emailService
      .sendWelcomeEmail(result.user.email, result.user.name, result.clinic.name, result.clinic.id)
      .catch(() => {});

    // Generate tokens
    const tokens = await this.generateTokens(
      result.user.id,
      result.clinic.id,
      result.user.role,
      result.user.permissions || [],
    );

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      clinic: {
        id: result.clinic.id,
        name: result.clinic.name,
      },
      ...tokens,
    };
  }

  async login(loginDto: LoginDto, meta?: RequestMeta) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: { clinic: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      this.auditService
        .log({
          action: 'LOGIN_FAILED',
          entity: 'User',
          entityId: user.id,
          userId: user.id,
          clinicId: user.clinic_id,
          ipAddress: meta?.ip,
          newValues: { reason: 'invalid_password' },
        })
        .catch(() => {});
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if 2FA is enabled
    if (user.two_factor_enabled && user.two_factor_method) {
      const twoFactorToken = this.twoFactorService.generateTwoFactorToken(user.id, user.clinic_id);

      // Auto-send code for WhatsApp method (with email fallback)
      let codeSent = true;
      let codeDeliveryMethod = user.two_factor_method;

      if (user.two_factor_method === 'whatsapp') {
        codeSent = await this.twoFactorService.sendWhatsAppCode(user.id);
        if (!codeSent) {
          // Fallback: send code via email
          codeSent = await this.twoFactorService.sendEmailCode(user.id);
          if (codeSent) {
            codeDeliveryMethod = 'email';
          }
        }
      }

      return {
        requires_2fa: true,
        two_factor_token: twoFactorToken,
        two_factor_method: user.two_factor_method,
        code_delivery_method: codeDeliveryMethod,
        methods_available: this.getAvailable2faMethods(user),
        code_sent: codeSent,
      };
    }

    // Audit log
    await this.auditService.log({
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      clinicId: user.clinic_id,
      userId: user.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    const tokens = await this.generateTokens(
      user.id,
      user.clinic_id,
      user.role,
      user.permissions || [],
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      clinic: user.clinic
        ? {
            id: user.clinic.id,
            name: user.clinic.name,
          }
        : null,
      ...tokens,
    };
  }

  async verify2fa(twoFactorToken: string, code: string, method?: string, meta?: RequestMeta) {
    const { userId } = this.twoFactorService.verifyTwoFactorToken(twoFactorToken);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clinic: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const effectiveMethod = method || user.two_factor_method;

    if (effectiveMethod === 'totp') {
      if (!user.totp_secret) {
        throw new BadRequestException('TOTP não configurado');
      }
      const isValid = this.twoFactorService.verifyTotp(user.totp_secret, code);
      if (!isValid) {
        throw new UnauthorizedException('Código TOTP inválido');
      }
    } else {
      // WhatsApp or email code verification
      await this.twoFactorService.verifyCode(userId, code);
    }

    // Audit log
    await this.auditService.log({
      action: 'LOGIN_2FA',
      entity: 'User',
      entityId: user.id,
      clinicId: user.clinic_id,
      userId: user.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    const tokens = await this.generateTokens(
      user.id,
      user.clinic_id,
      user.role,
      user.permissions || [],
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      clinic: user.clinic
        ? {
            id: user.clinic.id,
            name: user.clinic.name,
          }
        : null,
      ...tokens,
    };
  }

  async resend2faCode(twoFactorToken: string) {
    const { userId } = this.twoFactorService.verifyTwoFactorToken(twoFactorToken);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    if (user.two_factor_method === 'whatsapp') {
      const sent = await this.twoFactorService.sendWhatsAppCode(userId);
      if (!sent) {
        // Fallback: send code via email
        const emailSent = await this.twoFactorService.sendEmailCode(userId);
        if (!emailSent) {
          throw new BadRequestException(
            'Não foi possível enviar o código. Tente novamente mais tarde.',
          );
        }
        return {
          message: 'Código enviado por e-mail (WhatsApp indisponível)',
          delivery_method: 'email',
        };
      }
    } else if (user.two_factor_method === 'totp') {
      throw new BadRequestException('TOTP não requer reenvio de código');
    }

    return { message: 'Código reenviado com sucesso', delivery_method: user.two_factor_method };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'Se o email existir, enviaremos um link de redefinição' };
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Save hashed token in DB
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        reset_token: hashedToken,
        reset_token_expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Build reset link
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3001');
    const resetLink = `${frontendUrl}/forgot-password/reset?token=${rawToken}`;

    // Send email (uses clinic SMTP if configured, otherwise global)
    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetLink,
      user.clinic_id ?? undefined,
    );

    return { message: 'Se o email existir, enviaremos um link de redefinição' };
  }

  async resetPassword(token: string, newPassword: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        reset_token: hashedToken,
        reset_token_expires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        reset_token: null,
        reset_token_expires: null,
      },
    });

    return { message: 'Senha redefinida com sucesso' };
  }

  async googleLogin(googleIdToken: string, meta?: RequestMeta) {
    const { OAuth2Client } = await import('google-auth-library');
    const clientId = this.configService.get('GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new BadRequestException('Google OAuth não configurado');
    }

    const client = new OAuth2Client(clientId);

    let payload: any;
    try {
      const ticket = await client.verifyIdToken({
        idToken: googleIdToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token Google inválido');
    }

    if (!payload?.email) {
      throw new UnauthorizedException('Email não disponível no token Google');
    }

    if (!payload.email_verified) {
      throw new UnauthorizedException('Email Google não verificado');
    }

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: payload.email },
      include: { clinic: true },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Nenhuma conta encontrada com este email. Registre-se primeiro.',
      );
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Conta inativa');
    }

    // Link Google ID if first Google login
    if (!user.google_id) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          google_id: payload.sub,
          avatar_url: payload.picture || user.avatar_url,
        },
      });
    }

    // Check 2FA
    if (user.two_factor_enabled && user.two_factor_method) {
      const twoFactorToken = this.twoFactorService.generateTwoFactorToken(user.id, user.clinic_id);

      let codeSent = true;
      let codeDeliveryMethod = user.two_factor_method;

      if (user.two_factor_method === 'whatsapp') {
        codeSent = await this.twoFactorService.sendWhatsAppCode(user.id);
        if (!codeSent) {
          // Fallback: send code via email
          codeSent = await this.twoFactorService.sendEmailCode(user.id);
          if (codeSent) {
            codeDeliveryMethod = 'email';
          }
        }
      }

      return {
        requires_2fa: true,
        two_factor_token: twoFactorToken,
        two_factor_method: user.two_factor_method,
        code_delivery_method: codeDeliveryMethod,
        methods_available: this.getAvailable2faMethods(user),
        code_sent: codeSent,
      };
    }

    // Audit log
    await this.auditService.log({
      action: 'LOGIN_GOOGLE',
      entity: 'User',
      entityId: user.id,
      clinicId: user.clinic_id,
      userId: user.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    const tokens = await this.generateTokens(
      user.id,
      user.clinic_id,
      user.role,
      user.permissions || [],
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      clinic: user.clinic
        ? {
            id: user.clinic.id,
            name: user.clinic.name,
          }
        : null,
      ...tokens,
    };
  }

  // ============================================
  // 2FA SETUP METHODS
  // ============================================

  async setupWhatsApp2fa(userId: string, phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clinic: { select: { z_api_instance: true, z_api_token: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (!user.clinic_id || !user.clinic) {
      throw new BadRequestException('Usuário não está vinculado a uma clínica');
    }

    if (!user.clinic.z_api_instance || !user.clinic.z_api_token) {
      throw new BadRequestException(
        'WhatsApp (Z-API) não está configurado na sua clínica. Configure em Configurações > WhatsApp antes de ativar o 2FA por WhatsApp.',
      );
    }

    // Verify actual WhatsApp connection is active
    const isConnected = await this.twoFactorService.checkWhatsAppConnection(user.clinic_id);
    if (!isConnected) {
      throw new BadRequestException(
        'WhatsApp não está conectado. Verifique a conexão em Configurações > WhatsApp e tente novamente.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone: phone.replace(/\D/g, ''),
        two_factor_enabled: true,
        two_factor_method: 'whatsapp',
        totp_secret: null,
      },
    });

    return { message: '2FA WhatsApp ativado com sucesso' };
  }

  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.two_factor_enabled) {
      throw new BadRequestException('2FA já está ativado. Desative primeiro para reconfigurar.');
    }
    return this.twoFactorService.generateTotpSecret(userId);
  }

  async verifyTotpSetup(userId: string, code: string, secret: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.two_factor_enabled) {
      throw new BadRequestException('2FA já está ativado. Desative primeiro para reconfigurar.');
    }
    const isValid = this.twoFactorService.verifyTotp(secret, code);

    if (!isValid) {
      throw new BadRequestException('Código TOTP inválido');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        two_factor_enabled: true,
        two_factor_method: 'totp',
        totp_secret: secret,
      },
    });

    return { message: '2FA TOTP ativado com sucesso' };
  }

  async disable2fa(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Senha incorreta');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        two_factor_enabled: false,
        two_factor_method: null,
        totp_secret: null,
      },
    });

    await this.auditService.log({
      action: '2FA_DISABLED',
      entity: 'User',
      entityId: userId,
      clinicId: user.clinic_id,
      userId,
    });

    return { message: '2FA desativado com sucesso' };
  }

  async get2faStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        two_factor_enabled: true,
        two_factor_method: true,
        phone: true,
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');

    return {
      enabled: user.two_factor_enabled,
      method: user.two_factor_method,
      phone: user.phone ? `***${user.phone.slice(-4)}` : null,
    };
  }

  // ============================================
  // LOGOUT & TOKEN BLACKLIST
  // ============================================

  async logout(accessToken: string, refreshToken?: string) {
    // Blacklist the access token
    try {
      const accessPayload = this.jwtService.decode(accessToken) as { exp?: number };
      if (accessPayload?.exp) {
        const ttlMs = Math.max(0, accessPayload.exp * 1000 - Date.now());
        if (ttlMs > 0) {
          const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
          await this.cacheService.set(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`, true, ttlMs);
        }
      }
    } catch {
      // Best-effort blacklist — token might already be expired
    }

    // Blacklist the refresh token if provided
    if (refreshToken) {
      try {
        const refreshPayload = this.jwtService.decode(refreshToken) as { exp?: number };
        if (refreshPayload?.exp) {
          const ttlMs = Math.max(0, refreshPayload.exp * 1000 - Date.now());
          if (ttlMs > 0) {
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            await this.cacheService.set(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`, true, ttlMs);
          }
        }
      } catch {
        // Best-effort blacklist
      }
    }

    return { message: 'Logout successful' };
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await this.cacheService.get<boolean>(`${TOKEN_BLACKLIST_PREFIX}${tokenHash}`);
      return result === true;
    } catch {
      return false;
    }
  }

  // ============================================
  // EXISTING METHODS
  // ============================================

  async refreshToken(refreshToken: string) {
    try {
      // Check if refresh token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }

      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('User not found or inactive');
      }

      return this.generateTokens(user.id, user.clinic_id, user.role, user.permissions || []);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clinic: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      avatar_url: user.avatar_url,
      two_factor_enabled: user.two_factor_enabled,
      clinic: user.clinic
        ? {
            id: user.clinic.id,
            name: user.clinic.name,
            plan: user.clinic.plan,
          }
        : null,
      created_at: user.created_at,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        clinic_id: true,
        status: true,
      },
    });

    if (!user || user.status !== 'active') {
      return null;
    }

    return user;
  }

  private getAvailable2faMethods(user: any): string[] {
    const methods: string[] = [];
    if (user.phone) methods.push('whatsapp');
    if (user.totp_secret) methods.push('totp');
    return methods;
  }

  private async generateTokens(
    userId: string,
    clinicId: string | null,
    role: string,
    permissions: string[] = [],
  ) {
    const payload = {
      sub: userId,
      clinicId,
      role,
      permissions,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({
        ...payload,
        type: 'access',
      }),
      this.jwtService.signAsync(
        {
          ...payload,
          type: 'refresh',
        },
        {
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.configService.get('JWT_EXPIRATION', '7d'),
    };
  }
}
