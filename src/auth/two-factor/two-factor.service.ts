import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppService } from '../../integrations/whatsapp.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly whatsAppService: WhatsAppService,
    private readonly emailService: EmailService,
  ) {}

  // Generate a cryptographically secure 6-digit code
  private generateCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  // Check if user has sent too many codes recently (max 5 per 15 min)
  private async checkResendLimit(userId: string): Promise<void> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentCodes = await this.prisma.twoFactorCode.count({
      where: {
        user_id: userId,
        created_at: { gt: fifteenMinutesAgo },
      },
    });
    if (recentCodes >= 5) {
      throw new BadRequestException('Muitas tentativas. Aguarde 15 minutos.');
    }
  }

  // Send 2FA code via WhatsApp
  async sendWhatsAppCode(userId: string): Promise<boolean> {
    await this.checkResendLimit(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clinic: true },
    });

    if (!user || !user.phone || !user.clinic_id) {
      this.logger.warn(`Cannot send WhatsApp 2FA: user ${userId} has no phone or clinic`);
      return false;
    }

    const code = this.generateCode();
    const hashedCode = await bcrypt.hash(code, 12);

    // Invalidate previous codes
    await this.prisma.twoFactorCode.updateMany({
      where: { user_id: userId, used: false },
      data: { used: true },
    });

    // Save new code
    await this.prisma.twoFactorCode.create({
      data: {
        user_id: userId,
        code: hashedCode,
        method: 'whatsapp',
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    // Send via WhatsApp
    const message = `🔐 Seu código de verificação é: *${code}*\n\nEste código é válido por 5 minutos. Não compartilhe com ninguém.`;
    const sent = await this.whatsAppService.sendMessage(user.clinic_id, user.phone, message);

    if (!sent) {
      this.logger.warn(`Failed to send WhatsApp 2FA code to ${user.phone}`);
    }

    return sent;
  }

  // Send 2FA code via Email (backup method)
  async sendEmailCode(userId: string): Promise<boolean> {
    await this.checkResendLimit(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return false;

    const code = this.generateCode();
    const hashedCode = await bcrypt.hash(code, 12);

    await this.prisma.twoFactorCode.updateMany({
      where: { user_id: userId, used: false },
      data: { used: true },
    });

    await this.prisma.twoFactorCode.create({
      data: {
        user_id: userId,
        code: hashedCode,
        method: 'email',
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return this.emailService.sendTwoFactorCode(
      user.email,
      user.name,
      code,
      user.clinic_id ?? undefined,
    );
  }

  // Verify a 2FA code (WhatsApp or email)
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const twoFactorCode = await this.prisma.twoFactorCode.findFirst({
      where: {
        user_id: userId,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!twoFactorCode) {
      throw new UnauthorizedException('Código expirado ou inválido');
    }

    if (twoFactorCode.attempts >= 3) {
      await this.prisma.twoFactorCode.update({
        where: { id: twoFactorCode.id },
        data: { used: true },
      });
      throw new UnauthorizedException('Número máximo de tentativas excedido');
    }

    const isValid = await bcrypt.compare(code, twoFactorCode.code);

    if (!isValid) {
      await this.prisma.twoFactorCode.update({
        where: { id: twoFactorCode.id },
        data: { attempts: twoFactorCode.attempts + 1 },
      });
      throw new UnauthorizedException('Código inválido');
    }

    await this.prisma.twoFactorCode.update({
      where: { id: twoFactorCode.id },
      data: { used: true },
    });

    return true;
  }

  // Generate TOTP secret + QR code
  async generateTotpSecret(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new BadRequestException('Usuário não encontrado');

    const secret = new Secret();
    const totp = new TOTP({
      issuer: 'Odonto SaaS',
      label: user.email,
      secret,
    });

    const otpAuthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return { secret: secret.base32, qrCode };
  }

  // Verify TOTP code
  verifyTotp(secret: string, token: string): boolean {
    const totp = new TOTP({
      issuer: 'Odonto SaaS',
      label: 'user',
      secret: Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  }

  // Check if WhatsApp is actually connected for a clinic
  async checkWhatsAppConnection(clinicId: string): Promise<boolean> {
    return this.whatsAppService.checkConnection(clinicId);
  }

  // Generate short-lived 2FA pending token
  generateTwoFactorToken(userId: string, clinicId: string | null): string {
    return this.jwtService.sign(
      { sub: userId, clinicId, type: '2fa_pending' },
      { expiresIn: '5m' },
    );
  }

  // Verify 2FA pending token
  verifyTwoFactorToken(token: string): { userId: string; clinicId: string | null } {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      if (payload.type !== '2fa_pending') {
        throw new UnauthorizedException('Token inválido');
      }

      return { userId: payload.sub, clinicId: payload.clinicId };
    } catch {
      throw new UnauthorizedException('Token 2FA expirado ou inválido');
    }
  }
}
