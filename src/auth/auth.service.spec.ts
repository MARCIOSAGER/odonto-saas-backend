jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashedpassword'),
  compare: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwtService: { signAsync: jest.Mock; verify: jest.Mock };
  let configService: { get: jest.Mock };
  let auditService: { log: jest.Mock };
  let emailService: {
    sendWelcomeEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };
  let twoFactorService: {
    generateTwoFactorToken: jest.Mock;
    verifyTwoFactorToken: jest.Mock;
    sendWhatsAppCode: jest.Mock;
    sendEmailCode: jest.Mock;
    verifyCode: jest.Mock;
    verifyTotp: jest.Mock;
    generateTotpSecret: jest.Mock;
    checkWhatsAppConnection: jest.Mock;
  };

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@test.com',
    password: '$2a$12$hashedpassword',
    name: 'Test User',
    role: 'admin',
    clinic_id: 'clinic-uuid-1',
    status: 'active',
    two_factor_enabled: false,
    two_factor_method: null,
    totp_secret: null,
    phone: '11999999999',
    google_id: null,
    avatar_url: null,
    reset_token: null,
    reset_token_expires: null,
    created_at: new Date('2025-01-01'),
    clinic: { id: 'clinic-uuid-1', name: 'Test Clinic', plan: 'basic' },
  };

  const mockClinic = {
    id: 'clinic-uuid-1',
    name: 'Test Clinic',
    cnpj: '12345678000199',
    phone: '11999999999',
    email: 'test@test.com',
    plan: 'basic',
    status: 'active',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation((fn) => fn(prisma));

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, def?: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        if (key === 'JWT_EXPIRATION') return '7d';
        if (key === 'FRONTEND_URL') return 'http://localhost:3001';
        return def;
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    emailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    };

    twoFactorService = {
      generateTwoFactorToken: jest.fn(),
      verifyTwoFactorToken: jest.fn(),
      sendWhatsAppCode: jest.fn(),
      sendEmailCode: jest.fn(),
      verifyCode: jest.fn(),
      verifyTotp: jest.fn(),
      generateTotpSecret: jest.fn(),
      checkWhatsAppConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
        { provide: EmailService, useValue: emailService },
        { provide: TwoFactorService, useValue: twoFactorService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // register
  // ──────────────────────────────────────────────────
  describe('register', () => {
    const registerDto = {
      name: 'New User',
      email: 'new@test.com',
      password: 'Senha@123',
      clinic_name: 'New Clinic',
      cnpj: '12345678000199',
      phone: '11999999999',
    };

    it('should register a new user and clinic successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no existing user
      prisma.clinic.findUnique.mockResolvedValue(null); // no existing clinic
      prisma.clinic.create.mockResolvedValue(mockClinic);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-uuid',
        email: registerDto.email,
        name: registerDto.name,
        role: 'admin',
        clinic_id: mockClinic.id,
      });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('clinic');
      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result).toHaveProperty('refresh_token', 'mock-jwt-token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(result.user.email).toBe(registerDto.email);
      expect(result.clinic.name).toBe(mockClinic.name);
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGISTER',
          entity: 'User',
        }),
      );
    });

    it('should send welcome email fire-and-forget after registration', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.clinic.findUnique.mockResolvedValue(null);
      prisma.clinic.create.mockResolvedValue(mockClinic);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-uuid',
        email: registerDto.email,
        name: registerDto.name,
        role: 'admin',
        clinic_id: mockClinic.id,
      });

      await service.register(registerDto);

      expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
        registerDto.email,
        registerDto.name,
        mockClinic.name,
        mockClinic.id,
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'Email already registered',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if CNPJ already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.clinic.findUnique.mockResolvedValue(mockClinic);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        'CNPJ already registered',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should pass request meta to audit log', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.clinic.findUnique.mockResolvedValue(null);
      prisma.clinic.create.mockResolvedValue(mockClinic);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-uuid',
        email: registerDto.email,
        name: registerDto.name,
        role: 'admin',
        clinic_id: mockClinic.id,
      });

      const meta = { ip: '127.0.0.1', userAgent: 'test-agent' };
      await service.register(registerDto, meta);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // login
  // ──────────────────────────────────────────────────
  describe('login', () => {
    const loginDto = { email: 'test@test.com', password: 'Senha@123' };

    it('should login successfully and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result).toHaveProperty('refresh_token', 'mock-jwt-token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect((result as any).user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      });
      expect((result as any).clinic).toEqual({
        id: mockUser.clinic.id,
        name: mockUser.clinic.name,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN',
          entity: 'User',
          entityId: mockUser.id,
        }),
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: 'inactive',
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Account is inactive',
      );
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(loginDto)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should return requires_2fa when 2FA is enabled', async () => {
      const userWith2fa = {
        ...mockUser,
        two_factor_enabled: true,
        two_factor_method: 'whatsapp',
      };
      prisma.user.findUnique.mockResolvedValue(userWith2fa);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      twoFactorService.generateTwoFactorToken.mockReturnValue('2fa-token');
      twoFactorService.sendWhatsAppCode.mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toEqual(
        expect.objectContaining({
          requires_2fa: true,
          two_factor_token: '2fa-token',
          two_factor_method: 'whatsapp',
          code_sent: true,
        }),
      );
      expect(result).not.toHaveProperty('access_token');
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('should fallback to email when WhatsApp 2FA code sending fails', async () => {
      const userWith2fa = {
        ...mockUser,
        two_factor_enabled: true,
        two_factor_method: 'whatsapp',
      };
      prisma.user.findUnique.mockResolvedValue(userWith2fa);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      twoFactorService.generateTwoFactorToken.mockReturnValue('2fa-token');
      twoFactorService.sendWhatsAppCode.mockResolvedValue(false);
      twoFactorService.sendEmailCode.mockResolvedValue(true);

      const result = await service.login(loginDto);

      expect(result).toEqual(
        expect.objectContaining({
          requires_2fa: true,
          code_delivery_method: 'email',
          code_sent: true,
        }),
      );
      expect(twoFactorService.sendEmailCode).toHaveBeenCalledWith(
        mockUser.id,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // forgotPassword
  // ──────────────────────────────────────────────────
  describe('forgotPassword', () => {
    it('should return generic message when user not found (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword('nonexistent@test.com');

      expect(result).toEqual({
        message: 'Se o email existir, enviaremos um link de redefinição',
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should generate token, save hashed token, and send reset email', async () => {
      const { clinic: _clinic, ...userWithoutClinic } = mockUser;
      prisma.user.findUnique.mockResolvedValue(userWithoutClinic);
      prisma.user.update.mockResolvedValue(userWithoutClinic);

      const result = await service.forgotPassword(mockUser.email);

      expect(result).toEqual({
        message: 'Se o email existir, enviaremos um link de redefinição',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          reset_token: expect.any(String),
          reset_token_expires: expect.any(Date),
        },
      });
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.name,
        expect.stringContaining('http://localhost:3001/forgot-password/reset?token='),
        mockUser.clinic_id,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // resetPassword
  // ──────────────────────────────────────────────────
  describe('resetPassword', () => {
    it('should reset password when token is valid', async () => {
      const { clinic: _clinic, ...userWithoutClinic } = mockUser;
      prisma.user.findFirst.mockResolvedValue({
        ...userWithoutClinic,
        reset_token: 'hashed-token',
        reset_token_expires: new Date(Date.now() + 60 * 60 * 1000),
      });
      prisma.user.update.mockResolvedValue(userWithoutClinic);

      const result = await service.resetPassword('raw-token', 'NewPass@123');

      expect(result).toEqual({ message: 'Senha redefinida com sucesso' });
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass@123', 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          password: '$2a$12$hashedpassword',
          reset_token: null,
          reset_token_expires: null,
        },
      });
    });

    it('should throw BadRequestException when token is invalid or expired', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid-token', 'NewPass@123'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.resetPassword('invalid-token', 'NewPass@123'),
      ).rejects.toThrow('Token inválido ou expirado');
    });
  });

  // ──────────────────────────────────────────────────
  // refreshToken
  // ──────────────────────────────────────────────────
  describe('refreshToken', () => {
    it('should return new tokens for valid refresh token', async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        clinicId: mockUser.clinic_id,
        role: mockUser.role,
        type: 'refresh',
      });
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.refreshToken('valid-refresh-token');

      expect(result).toHaveProperty('access_token', 'mock-jwt-token');
      expect(result).toHaveProperty('refresh_token', 'mock-jwt-token');
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(jwtService.verify).toHaveBeenCalledWith('valid-refresh-token', {
        secret: 'test-secret',
      });
    });

    it('should throw UnauthorizedException for non-refresh token type', async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'access',
      });

      await expect(
        service.refreshToken('access-token-instead'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      jwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
      });
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: 'inactive',
      });

      await expect(
        service.refreshToken('valid-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        service.refreshToken('garbage-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ──────────────────────────────────────────────────
  // getProfile
  // ──────────────────────────────────────────────────
  describe('getProfile', () => {
    it('should return formatted user profile with clinic', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(mockUser.id);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        status: mockUser.status,
        avatar_url: mockUser.avatar_url,
        two_factor_enabled: mockUser.two_factor_enabled,
        clinic: {
          id: mockUser.clinic.id,
          name: mockUser.clinic.name,
          plan: mockUser.clinic.plan,
        },
        created_at: mockUser.created_at,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        'User not found',
      );
    });
  });

  // ──────────────────────────────────────────────────
  // validateUser
  // ──────────────────────────────────────────────────
  describe('validateUser', () => {
    it('should return user data for active user', async () => {
      const selectUser = {
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        clinic_id: mockUser.clinic_id,
        status: 'active',
      };
      prisma.user.findUnique.mockResolvedValue(selectUser);

      const result = await service.validateUser(mockUser.id);

      expect(result).toEqual(selectUser);
    });

    it('should return null if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return null if user is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        clinic_id: mockUser.clinic_id,
        status: 'inactive',
      });

      const result = await service.validateUser(mockUser.id);

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────
  // disable2fa
  // ──────────────────────────────────────────────────
  describe('disable2fa', () => {
    it('should disable 2FA when password is correct', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        two_factor_enabled: false,
        two_factor_method: null,
        totp_secret: null,
      });

      const result = await service.disable2fa(mockUser.id, 'Senha@123');

      expect(result).toEqual({ message: '2FA desativado com sucesso' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: {
          two_factor_enabled: false,
          two_factor_method: null,
          totp_secret: null,
        },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.disable2fa('non-existent-id', 'password'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.disable2fa(mockUser.id, 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.disable2fa(mockUser.id, 'wrong-password'),
      ).rejects.toThrow('Senha incorreta');
    });
  });

  // ──────────────────────────────────────────────────
  // get2faStatus
  // ──────────────────────────────────────────────────
  describe('get2faStatus', () => {
    it('should return 2FA status with masked phone', async () => {
      prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: true,
        two_factor_method: 'whatsapp',
        phone: '11999999999',
      });

      const result = await service.get2faStatus(mockUser.id);

      expect(result).toEqual({
        enabled: true,
        method: 'whatsapp',
        phone: '***9999',
      });
    });

    it('should return null phone when user has no phone', async () => {
      prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: false,
        two_factor_method: null,
        phone: null,
      });

      const result = await service.get2faStatus(mockUser.id);

      expect(result).toEqual({
        enabled: false,
        method: null,
        phone: null,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.get2faStatus('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
