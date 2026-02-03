import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as request from 'supertest';
import { AppointmentsController } from '../src/appointments/appointments.controller';
import { AppointmentsService } from '../src/appointments/appointments.service';
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

describe('AppointmentsController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;

  const mockAppointment = {
    id: 'apt-uuid',
    patient_id: 'patient-uuid',
    dentist_id: 'dentist-uuid',
    service_id: 'service-uuid',
    clinic_id: 'clinic-uuid',
    date: '2025-06-15',
    time: '10:00',
    status: 'scheduled',
    notes: null,
    patient: { id: 'patient-uuid', name: 'Carlos Oliveira' },
    dentist: { id: 'dentist-uuid', name: 'Dr. Silva' },
    service: { id: 'service-uuid', name: 'Limpeza', price: 150 },
    created_at: '2025-01-01T00:00:00.000Z',
  };

  const mockAppointmentsService = {
    findAll: jest.fn().mockResolvedValue({
      data: [mockAppointment],
      meta: { total: 1, page: 1, limit: 20 },
    }),
    getToday: jest.fn().mockResolvedValue([mockAppointment]),
    getAvailableSlots: jest.fn().mockResolvedValue([
      { time: '09:00', available: true },
      { time: '10:00', available: false },
      { time: '11:00', available: true },
    ]),
    create: jest.fn().mockResolvedValue(mockAppointment),
    findOne: jest.fn().mockResolvedValue(mockAppointment),
    update: jest.fn().mockResolvedValue({ ...mockAppointment, notes: 'Updated' }),
    cancel: jest.fn().mockResolvedValue({ ...mockAppointment, status: 'cancelled' }),
    confirm: jest.fn().mockResolvedValue({ ...mockAppointment, status: 'confirmed' }),
    complete: jest.fn().mockResolvedValue({ ...mockAppointment, status: 'completed' }),
    softDelete: jest.fn().mockResolvedValue({ message: 'Appointment deleted' }),
    restore: jest.fn().mockResolvedValue(mockAppointment),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: mockAppointmentsService },
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
    it('should return 401 without JWT on GET /appointments', () => {
      return request(app.getHttpServer())
        .get('/api/v1/appointments')
        .expect(401);
    });

    it('should return 401 without JWT on POST /appointments', () => {
      return request(app.getHttpServer())
        .post('/api/v1/appointments')
        .send({})
        .expect(401);
    });
  });

  // ── GET /api/v1/appointments ──

  describe('GET /api/v1/appointments', () => {
    it('should return appointment list', () => {
      return request(app.getHttpServer())
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.data).toHaveLength(1);
          expect(res.body.data.meta.total).toBe(1);
          expect(mockAppointmentsService.findAll).toHaveBeenCalledWith('clinic-uuid', expect.any(Object));
        });
    });

    it('should pass filter params', () => {
      return request(app.getHttpServer())
        .get('/api/v1/appointments?date=2025-06-15&status=scheduled&dentist_id=d-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect(() => {
          expect(mockAppointmentsService.findAll).toHaveBeenCalledWith('clinic-uuid', expect.objectContaining({
            date: '2025-06-15',
            status: 'scheduled',
            dentistId: 'd-uuid',
          }));
        });
    });
  });

  // ── GET /api/v1/appointments/today ──

  describe('GET /api/v1/appointments/today', () => {
    it('should return today appointments', () => {
      return request(app.getHttpServer())
        .get('/api/v1/appointments/today')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(mockAppointmentsService.getToday).toHaveBeenCalledWith('clinic-uuid');
        });
    });
  });

  // ── GET /api/v1/appointments/available-slots ──

  describe('GET /api/v1/appointments/available-slots', () => {
    it('should return available slots', () => {
      return request(app.getHttpServer())
        .get('/api/v1/appointments/available-slots?date=2025-06-15')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(mockAppointmentsService.getAvailableSlots).toHaveBeenCalled();
        });
    });
  });

  // ── POST /api/v1/appointments ──

  describe('POST /api/v1/appointments', () => {
    it('should create appointment', () => {
      return request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          patient_id: '550e8400-e29b-41d4-a716-446655440001',
          service_id: '550e8400-e29b-41d4-a716-446655440003',
          date: '2025-06-15',
          time: '10:00',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.id).toBe('apt-uuid');
          expect(mockAppointmentsService.create).toHaveBeenCalled();
        });
    });
  });

  // ── GET /api/v1/appointments/:id ──

  describe('GET /api/v1/appointments/:id', () => {
    it('should return appointment by ID', () => {
      return request(app.getHttpServer())
        .get('/api/v1/appointments/a0000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.id).toBe('apt-uuid');
        });
    });

    it('should return 400 for invalid UUID', () => {
      return request(app.getHttpServer())
        .get('/api/v1/appointments/not-a-uuid')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  // ── PUT /api/v1/appointments/:id/confirm ──

  describe('PUT /api/v1/appointments/:id/confirm', () => {
    it('should confirm appointment', () => {
      return request(app.getHttpServer())
        .put('/api/v1/appointments/a0000000-0000-0000-0000-000000000001/confirm')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe('confirmed');
          expect(mockAppointmentsService.confirm).toHaveBeenCalled();
        });
    });
  });

  // ── PUT /api/v1/appointments/:id/complete ──

  describe('PUT /api/v1/appointments/:id/complete', () => {
    it('should complete appointment', () => {
      return request(app.getHttpServer())
        .put('/api/v1/appointments/a0000000-0000-0000-0000-000000000001/complete')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ notes: 'Completed successfully' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe('completed');
          expect(mockAppointmentsService.complete).toHaveBeenCalled();
        });
    });
  });

  // ── DELETE /api/v1/appointments/:id ──

  describe('DELETE /api/v1/appointments/:id', () => {
    it('should cancel appointment', () => {
      return request(app.getHttpServer())
        .delete('/api/v1/appointments/a0000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Patient requested' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe('cancelled');
          expect(mockAppointmentsService.cancel).toHaveBeenCalled();
        });
    });
  });
});
