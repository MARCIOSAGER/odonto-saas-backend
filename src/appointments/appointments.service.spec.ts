import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { createPrismaMock } from '../test/prisma-mock';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { log: jest.Mock };

  const clinicId = 'clinic-uuid-1';
  const userId = 'user-uuid-1';

  const mockAppointment = {
    id: 'appt-uuid-1',
    clinic_id: clinicId,
    patient_id: 'patient-uuid-1',
    dentist_id: 'dentist-uuid-1',
    service_id: 'service-uuid-1',
    date: new Date('2025-07-15'),
    time: '10:00',
    duration: 30,
    status: 'scheduled',
    notes: null,
    cancel_reason: null,
    cancelled_at: null,
    confirmed_at: null,
    deleted_at: null,
    created_at: new Date('2025-07-01'),
    updated_at: new Date('2025-07-01'),
    patient: { id: 'patient-uuid-1', name: 'Maria Silva', phone: '11999999999' },
    dentist: { id: 'dentist-uuid-1', name: 'Dr. Carlos', specialty: 'Ortodontia' },
    service: { id: 'service-uuid-1', name: 'Limpeza', price: 150, duration: 30 },
  };

  const mockPatient = {
    id: 'patient-uuid-1',
    clinic_id: clinicId,
    name: 'Maria Silva',
    phone: '11999999999',
  };

  const mockService = {
    id: 'service-uuid-1',
    clinic_id: clinicId,
    name: 'Limpeza',
    price: 150,
    duration: 30,
  };

  const mockDentist = {
    id: 'dentist-uuid-1',
    clinic_id: clinicId,
    name: 'Dr. Carlos',
    specialty: 'Ortodontia',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const notificationsService = {
      create: jest.fn().mockResolvedValue({}),
      notifyClinic: jest.fn().mockResolvedValue([]),
    };
    const notificationsGateway = { sendToUser: jest.fn(), sendUnreadCount: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: notificationsGateway },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // findAll
  // ──────────────────────────────────────────────────
  describe('findAll', () => {
    it('should return paginated appointments with deleted_at: null', async () => {
      const appointments = [mockAppointment];
      prisma.appointment.findMany.mockResolvedValue(appointments);
      prisma.appointment.count.mockResolvedValue(1);

      const result = await service.findAll(clinicId, { page: 1, limit: 10 });

      expect(result).toEqual({
        data: appointments,
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinic_id: clinicId,
            deleted_at: null,
          }),
          skip: 0,
          take: 10,
          orderBy: [{ date: 'asc' }, { time: 'asc' }],
        }),
      );
      expect(prisma.appointment.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          clinic_id: clinicId,
          deleted_at: null,
        }),
      });
    });

    it('should apply status, dentist, and patient filters', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.appointment.count.mockResolvedValue(0);

      await service.findAll(clinicId, {
        status: 'confirmed',
        dentistId: 'dentist-uuid-1',
        patientId: 'patient-uuid-1',
      });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'confirmed',
            dentist_id: 'dentist-uuid-1',
            patient_id: 'patient-uuid-1',
          }),
        }),
      );
    });

    it('should apply date range filter', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.appointment.count.mockResolvedValue(0);

      await service.findAll(clinicId, { date: '2025-07-15' });

      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        }),
      );
    });
  });

  // ──────────────────────────────────────────────────
  // findOne
  // ──────────────────────────────────────────────────
  describe('findOne', () => {
    it('should return an appointment by id', async () => {
      prisma.appointment.findFirst.mockResolvedValue(mockAppointment);

      const result = await service.findOne(clinicId, mockAppointment.id);

      expect(result).toEqual(mockAppointment);
      expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
        where: { id: mockAppointment.id, clinic_id: clinicId, deleted_at: null },
        include: { patient: true, dentist: true, service: true },
      });
    });

    it('should throw NotFoundException when appointment not found', async () => {
      prisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.findOne(clinicId, 'non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────
  describe('create', () => {
    const createDto = {
      patient_id: 'patient-uuid-1',
      dentist_id: 'dentist-uuid-1',
      service_id: 'service-uuid-1',
      date: '2025-07-20',
      time: '14:00',
      notes: 'Primeira consulta',
    };

    it('should create an appointment after validating patient and service', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.service.findFirst.mockResolvedValue(mockService);
      prisma.dentist.findFirst.mockResolvedValue(mockDentist);
      // checkAvailability: no existing appointment at that slot
      prisma.appointment.findFirst.mockResolvedValueOnce(null); // checkAvailability returns no conflict
      prisma.appointment.create.mockResolvedValue({
        ...mockAppointment,
        id: 'new-appt-uuid',
        date: new Date('2025-07-20'),
        time: '14:00',
        notes: 'Primeira consulta',
      });

      const result = await service.create(clinicId, createDto as any, userId);

      expect(result).toBeDefined();
      expect(result.id).toBe('new-appt-uuid');
      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: createDto.patient_id, clinic_id: clinicId },
      });
      expect(prisma.service.findFirst).toHaveBeenCalledWith({
        where: { id: createDto.service_id, clinic_id: clinicId },
      });
      expect(prisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clinic_id: clinicId,
            patient_id: createDto.patient_id,
            service_id: createDto.service_id,
            status: 'scheduled',
          }),
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'Appointment',
          clinicId,
          userId,
        }),
      );
    });

    it('should throw NotFoundException when patient not found', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);

      await expect(service.create(clinicId, createDto as any, userId)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when service not found', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.service.findFirst.mockResolvedValue(null);

      await expect(service.create(clinicId, createDto as any, userId)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when time slot is not available', async () => {
      prisma.patient.findFirst.mockResolvedValue(mockPatient);
      prisma.service.findFirst.mockResolvedValue(mockService);
      prisma.dentist.findFirst.mockResolvedValue(mockDentist);
      // checkAvailability: existing appointment at the slot
      prisma.appointment.findFirst.mockResolvedValue(mockAppointment);

      await expect(service.create(clinicId, createDto as any, userId)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // cancel
  // ──────────────────────────────────────────────────
  describe('cancel', () => {
    it('should cancel a scheduled appointment', async () => {
      prisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      const cancelledAppointment = {
        ...mockAppointment,
        status: 'cancelled',
        cancel_reason: 'Patient request',
        cancelled_at: new Date(),
      };
      prisma.appointment.update.mockResolvedValue(cancelledAppointment);

      const result = await service.cancel(clinicId, mockAppointment.id, 'Patient request', userId);

      expect(result.status).toBe('cancelled');
      expect(result.cancel_reason).toBe('Patient request');
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: mockAppointment.id },
        data: {
          status: 'cancelled',
          cancel_reason: 'Patient request',
          cancelled_at: expect.any(Date),
        },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CANCEL',
          entity: 'Appointment',
          entityId: mockAppointment.id,
        }),
      );
    });

    it('should throw BadRequestException if already cancelled', async () => {
      const cancelledAppointment = { ...mockAppointment, status: 'cancelled' };
      prisma.appointment.findFirst.mockResolvedValue(cancelledAppointment);

      await expect(
        service.cancel(clinicId, mockAppointment.id, 'Duplicate cancel', userId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // confirm
  // ──────────────────────────────────────────────────
  describe('confirm', () => {
    it('should confirm a scheduled appointment', async () => {
      prisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      const confirmedAppointment = {
        ...mockAppointment,
        status: 'confirmed',
        confirmed_at: new Date(),
      };
      prisma.appointment.update.mockResolvedValue(confirmedAppointment);

      const result = await service.confirm(clinicId, mockAppointment.id, userId);

      expect(result.status).toBe('confirmed');
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: mockAppointment.id },
        data: {
          status: 'confirmed',
          confirmed_at: expect.any(Date),
        },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONFIRM',
          entity: 'Appointment',
        }),
      );
    });

    it('should throw BadRequestException if appointment is not scheduled', async () => {
      const confirmedAppointment = { ...mockAppointment, status: 'confirmed' };
      prisma.appointment.findFirst.mockResolvedValue(confirmedAppointment);

      await expect(service.confirm(clinicId, mockAppointment.id, userId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if appointment is cancelled', async () => {
      const cancelledAppointment = { ...mockAppointment, status: 'cancelled' };
      prisma.appointment.findFirst.mockResolvedValue(cancelledAppointment);

      await expect(service.confirm(clinicId, mockAppointment.id, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ──────────────────────────────────────────────────
  // complete
  // ──────────────────────────────────────────────────
  describe('complete', () => {
    it('should complete an appointment and update patient last_visit', async () => {
      const confirmedAppointment = { ...mockAppointment, status: 'confirmed' };
      prisma.appointment.findFirst.mockResolvedValue(confirmedAppointment);
      const completedAppointment = {
        ...confirmedAppointment,
        status: 'completed',
        notes: 'Limpeza realizada com sucesso',
      };
      prisma.appointment.update.mockResolvedValue(completedAppointment);
      prisma.patient.update.mockResolvedValue({});

      const result = await service.complete(
        clinicId,
        mockAppointment.id,
        'Limpeza realizada com sucesso',
        userId,
      );

      expect(result.status).toBe('completed');
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: mockAppointment.id },
        data: {
          status: 'completed',
          notes: 'Limpeza realizada com sucesso',
        },
      });
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: confirmedAppointment.patient_id },
        data: { last_visit: expect.any(Date) },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'COMPLETE',
          entity: 'Appointment',
        }),
      );
    });

    it('should throw BadRequestException if appointment is cancelled', async () => {
      const cancelledAppointment = { ...mockAppointment, status: 'cancelled' };
      prisma.appointment.findFirst.mockResolvedValue(cancelledAppointment);

      await expect(service.complete(clinicId, mockAppointment.id, 'Notes', userId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────
  // softDelete
  // ──────────────────────────────────────────────────
  describe('softDelete', () => {
    it('should set deleted_at on the appointment', async () => {
      prisma.appointment.findFirst.mockResolvedValue(mockAppointment);
      const deletedAppointment = {
        ...mockAppointment,
        deleted_at: new Date('2025-08-01'),
      };
      prisma.appointment.update.mockResolvedValue(deletedAppointment);

      const result = await service.softDelete(clinicId, mockAppointment.id, userId);

      expect(result).toEqual({ message: 'Appointment deleted successfully' });
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: mockAppointment.id },
        data: { deleted_at: expect.any(Date) },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entity: 'Appointment',
          entityId: mockAppointment.id,
        }),
      );
    });

    it('should throw NotFoundException if appointment does not exist', async () => {
      prisma.appointment.findFirst.mockResolvedValue(null);

      await expect(service.softDelete(clinicId, 'non-existent-id', userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
