import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// Inline JWT strategy for testing (no database dependency)
@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'test-secret',
    });
  }

  async validate(payload: { sub: string; clinicId: string; role: string; email: string; type: string }) {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return {
      userId: payload.sub,
      clinicId: payload.clinicId,
      role: payload.role,
      email: payload.email,
      name: 'Test User',
    };
  }
}

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;

  const mockRegisterResponse = {
    user: { id: 'user-uuid', email: 'joao@clinica.com', name: 'Joao Silva', role: 'admin' },
    clinic: { id: 'clinic-uuid', name: 'Clinica Odontologica Silva' },
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'Bearer',
    expires_in: '7d',
  };

  const mockLoginResponse = {
    user: { id: 'user-uuid', email: 'joao@clinica.com', name: 'Joao Silva', role: 'admin' },
    clinic: { id: 'clinic-uuid', name: 'Clinica Odontologica Silva' },
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'Bearer',
    expires_in: '7d',
  };

  const mock2faResponse = {
    requires_2fa: true,
    two_factor_token: 'mock-2fa-token',
    two_factor_method: 'whatsapp',
    code_sent: true,
  };

  const mockProfileResponse = {
    id: 'user-uuid',
    email: 'test@test.com',
    name: 'Joao Silva',
    role: 'admin',
    status: 'active',
    clinic: { id: 'clinic-uuid', name: 'Clinica Odontologica Silva' },
  };

  const mockAuthService = {
    register: jest.fn().mockResolvedValue(mockRegisterResponse),
    login: jest.fn().mockResolvedValue(mockLoginResponse),
    getProfile: jest.fn().mockResolvedValue(mockProfileResponse),
    forgotPassword: jest.fn().mockResolvedValue({ message: 'Email enviado' }),
    refreshToken: jest.fn().mockResolvedValue({ access_token: 'new-token' }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        TestJwtStrategy,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    accessToken = jwtService.sign({
      sub: 'user-uuid',
      email: 'test@test.com',
      role: 'admin',
      clinicId: 'clinic-uuid',
      type: 'access',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── POST /api/v1/auth/register ──

  describe('POST /api/v1/auth/register', () => {
    const validBody = {
      name: 'Joao Silva',
      email: 'joao@clinica.com',
      password: 'Senha@123',
      clinic_name: 'Clinica Odontologica Silva',
      cnpj: '12345678000199',
      phone: '11999999999',
    };

    it('should register successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(validBody)
        .expect(201)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.user.id).toBe('user-uuid');
          expect(res.body.data.access_token).toBe('mock-access-token');
          expect(res.body.timestamp).toBeDefined();
          expect(mockAuthService.register).toHaveBeenCalledTimes(1);
        });
    });

    it('should return 400 when name is missing', () => {
      const { name, ...body } = validBody;
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(body)
        .expect(400)
        .expect(() => {
          expect(mockAuthService.register).not.toHaveBeenCalled();
        });
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, email: 'not-an-email' })
        .expect(400);
    });

    it('should return 400 when password is too short', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, password: 'short' })
        .expect(400);
    });

    it('should return 400 when cnpj is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, cnpj: '12345' })
        .expect(400);
    });

    it('should return 400 when phone is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, phone: '123' })
        .expect(400);
    });

    it('should return 400 for non-whitelisted properties', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, unknown_field: 'bad' })
        .expect(400);
    });

    it('should return 409 when email already exists', () => {
      mockAuthService.register.mockRejectedValueOnce(
        new ConflictException('Email already registered'),
      );
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(validBody)
        .expect(409);
    });

    it('should accept CPF (11 digits) as cnpj field', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...validBody, cnpj: '12345678901' })
        .expect(201);
    });
  });

  // ── POST /api/v1/auth/login ──

  describe('POST /api/v1/auth/login', () => {
    const validBody = { email: 'joao@clinica.com', password: 'Senha@123' };

    it('should login successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(validBody)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.user.id).toBe('user-uuid');
          expect(res.body.data.access_token).toBeDefined();
          expect(mockAuthService.login).toHaveBeenCalledTimes(1);
        });
    });

    it('should return 401 for invalid credentials', () => {
      mockAuthService.login.mockRejectedValueOnce(
        new UnauthorizedException('Invalid credentials'),
      );
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(validBody)
        .expect(401);
    });

    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ password: 'Senha@123' })
        .expect(400);
    });

    it('should return 400 when password is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'joao@clinica.com' })
        .expect(400);
    });

    it('should return 400 when password is too short', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'joao@clinica.com', password: '12345' })
        .expect(400);
    });

    it('should return requires_2fa when 2FA is enabled', () => {
      mockAuthService.login.mockResolvedValueOnce(mock2faResponse);
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(validBody)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.requires_2fa).toBe(true);
          expect(res.body.data.two_factor_token).toBeDefined();
        });
    });
  });

  // ── GET /api/v1/auth/me ──

  describe('GET /api/v1/auth/me', () => {
    it('should return profile with valid JWT', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.id).toBe('user-uuid');
          expect(mockAuthService.getProfile).toHaveBeenCalledWith('user-uuid');
        });
    });

    it('should return 401 without JWT', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should return 401 with invalid JWT', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return 401 with expired JWT', () => {
      const expired = jwtService.sign(
        { sub: 'user-uuid', email: 'test@test.com', role: 'admin', clinicId: 'clinic-uuid', type: 'access' },
        { expiresIn: '0s' },
      );
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });
  });

  // ── POST /api/v1/auth/forgot-password ──

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should send reset email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'joao@clinica.com' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(mockAuthService.forgotPassword).toHaveBeenCalledWith('joao@clinica.com');
        });
    });

    it('should return 400 when email is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({})
        .expect(400);
    });

    it('should return 400 when email is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-valid' })
        .expect(400);
    });
  });

  // ── Response format ──

  describe('Response format', () => {
    it('should wrap responses with { success, data, timestamp }', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'joao@clinica.com', password: 'Senha@123' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('timestamp');
        });
    });

    it('should format errors with { statusCode, timestamp, path, method, message }', () => {
      mockAuthService.login.mockRejectedValueOnce(
        new UnauthorizedException('Invalid credentials'),
      );
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'joao@clinica.com', password: 'Senha@123' })
        .expect(401)
        .expect((res) => {
          expect(res.body).toHaveProperty('statusCode', 401);
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('path');
          expect(res.body).toHaveProperty('method', 'POST');
          expect(res.body).toHaveProperty('message');
        });
    });
  });
});
