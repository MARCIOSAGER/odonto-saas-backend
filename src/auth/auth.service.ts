import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuditService } from '../audit/audit.service';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
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
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

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

    // Generate tokens
    const tokens = await this.generateTokens(result.user.id, result.clinic.id, result.user.role);

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
      throw new UnauthorizedException('Invalid credentials');
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

    const tokens = await this.generateTokens(user.id, user.clinic_id, user.role);

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

  async refreshToken(refreshToken: string) {
    try {
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

      return this.generateTokens(user.id, user.clinic_id, user.role);
    } catch {
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

  private async generateTokens(userId: string, clinicId: string | null, role: string) {
    const payload = {
      sub: userId,
      clinicId,
      role,
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
          expiresIn: '30d',
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
