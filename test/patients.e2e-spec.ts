import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType, Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as request from 'supertest';
import { PatientsController } from '../src/patients/patients.controller';
import { PatientsService } from '../src/patients/patients.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

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
    if (payload.type !== 'access') throw new UnauthorizedException();
    return { userId: payload.sub, clinicId: payload.clinicId, role: payload.role, email: payload.email };
  }
}

describe('PatientsController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;

  const mockPatient = {
    id: 'patient-uuid',
    name: 'Carlos Oliveira',
    phone: '11999999999',
    cpf: '12345678901',
    email: 'carlos@email.com',
    birth_date: '1990-05-15',
    address: 'Rua das Palmeiras, 456',
    notes: null,
    status: 'active',
    clinic_id: 'clinic-uuid',
    created_at: '2025-01-01T00:00:00.000Z',
  };

  const mockPatientsService = {
    findAll: jest.fn().mockResolvedValue({
      data: [mockPatient],
      meta: { total: 1, page: 1, limit: 20 },
    }),
    create: jest.fn().mockResolvedValue(mockPatient),
    findOne: jest.fn().mockResolvedValue(mockPatient),
    findByPhone: jest.fn().mockResolvedValue(mockPatient),
    update: jest.fn().mockResolvedValue({ ...mockPatient, name: 'Carlos Updated' }),
    remove: jest.fn().mockResolvedValue({ message: 'Patient deactivated' }),
    restore: jest.fn().mockResolvedValue({ ...mockPatient, status: 'active' }),
    getAppointments: jest.fn().mockResolvedValue([]),
    getFinancialSummary: jest.fn().mockResolvedValue({
      completed: { total: 500, count: 3 },
      pending: { total: 200, count: 1 },
      cancelled: { total: 0, count: 0 },
    }),
    getTimeline: jest.fn().mockResolvedValue({ events: [], total: 0 }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [PatientsController],
      providers: [
        { provide: PatientsService, useValue: mockPatientsService },
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

  // ── Auth guard ──

  describe('Authentication', () => {
    it('should return 401 without JWT on GET /patients', () => {
      return request(app.getHttpServer())
        .get('/api/v1/patients')
        .expect(401);
    });

    it('should return 401 without JWT on POST /patients', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .send({ name: 'Test', phone: '11999999999' })
        .expect(401);
    });
  });

  // ── GET /api/v1/patients ──

  describe('GET /api/v1/patients', () => {
    it('should return patient list', () => {
      return request(app.getHttpServer())
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.data).toHaveLength(1);
          expect(res.body.data.meta.total).toBe(1);
          expect(mockPatientsService.findAll).toHaveBeenCalledWith('clinic-uuid', expect.any(Object));
        });
    });

    it('should pass query params to service', () => {
      return request(app.getHttpServer())
        .get('/api/v1/patients?page=2&limit=10&search=carlos&status=active')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect(() => {
          expect(mockPatientsService.findAll).toHaveBeenCalledWith('clinic-uuid', {
            page: 2,
            limit: 10,
            search: 'carlos',
            status: 'active',
          });
        });
    });
  });

  // ── POST /api/v1/patients ──

  describe('POST /api/v1/patients', () => {
    const validBody = { name: 'Carlos Oliveira', phone: '11999999999' };

    it('should create patient successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody)
        .expect(201)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.id).toBe('patient-uuid');
          expect(mockPatientsService.create).toHaveBeenCalledWith(
            'clinic-uuid',
            expect.objectContaining({ name: 'Carlos Oliveira', phone: '11999999999' }),
            'user-uuid',
          );
        });
    });

    it('should create patient with optional fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          ...validBody,
          email: 'carlos@email.com',
          cpf: '12345678901',
          birth_date: '1990-05-15',
          address: 'Rua 123',
        })
        .expect(201);
    });

    it('should return 400 when name is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: '11999999999' })
        .expect(400);
    });

    it('should return 400 when phone is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Carlos', phone: '123' })
        .expect(400);
    });

    it('should return 400 when cpf is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...validBody, cpf: '12345' })
        .expect(400);
    });

    it('should return 400 when birth_date format is wrong', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...validBody, birth_date: '15/05/1990' })
        .expect(400);
    });

    it('should return 400 for non-whitelisted properties', () => {
      return request(app.getHttpServer())
        .post('/api/v1/patients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...validBody, unknown: 'bad' })
        .expect(400);
    });
  });

  // ── GET /api/v1/patients/:id ──

  describe('GET /api/v1/patients/:id', () => {
    it('should return patient by ID', () => {
      return request(app.getHttpServer())
        .get('/api/v1/patients/a0000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.id).toBe('patient-uuid');
        });
    });

    it('should return 400 for invalid UUID', () => {
      return request(app.getHttpServer())
        .get('/api/v1/patients/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should return 404 when patient not found', () => {
      mockPatientsService.findOne.mockRejectedValueOnce(new NotFoundException('Patient not found'));
      return request(app.getHttpServer())
        .get('/api/v1/patients/a0000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ── PUT /api/v1/patients/:id ──

  describe('PUT /api/v1/patients/:id', () => {
    it('should update patient', () => {
      return request(app.getHttpServer())
        .put('/api/v1/patients/a0000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Carlos Updated' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(mockPatientsService.update).toHaveBeenCalled();
        });
    });
  });

  // ── DELETE /api/v1/patients/:id ──

  describe('DELETE /api/v1/patients/:id', () => {
    it('should deactivate patient', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/patients/a0000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(mockPatientsService.remove).toHaveBeenCalled();
        });
    });
  });

  // ── GET /api/v1/patients/:id/financial ──

  describe('GET /api/v1/patients/:id/financial', () => {
    it('should return financial summary', () => {
      return request(app.getHttpServer())
        .get('/api/v1/patients/a0000000-0000-0000-0000-000000000001/financial')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.completed).toBeDefined();
          expect(mockPatientsService.getFinancialSummary).toHaveBeenCalled();
        });
    });
  });

  // ── GET /api/v1/patients/:id/timeline ──

  describe('GET /api/v1/patients/:id/timeline', () => {
    it('should return timeline', () => {
      return request(app.getHttpServer())
        .get('/api/v1/patients/a0000000-0000-0000-0000-000000000001/timeline')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.events).toBeDefined();
          expect(mockPatientsService.getTimeline).toHaveBeenCalled();
        });
    });
  });
});
