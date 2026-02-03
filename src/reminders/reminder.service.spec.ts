import { Test, TestingModule } from '@nestjs/testing';
import { ReminderService } from './reminder.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { EmailService } from '../email/email.service';
import { createPrismaMock } from '../test/prisma-mock';

describe('ReminderService', () => {
  let service: ReminderService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let whatsappService: { sendMessage: jest.Mock };
  let emailService: { sendAppointmentReminder: jest.Mock };

  // ──────────────────────────────────────────────────
  // Mock data
  // ──────────────────────────────────────────────────
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const mockAppointment = {
    id: 'apt-uuid-1',
    clinic_id: 'clinic-uuid-1',
    patient_id: 'patient-uuid-1',
    status: 'scheduled',
    reminder_sent: false,
    reminder_1h_sent: false,
    date: tomorrow,
    time:
      tomorrow.getHours().toString().padStart(2, '0') +
      ':' +
      tomorrow.getMinutes().toString().padStart(2, '0'),
    patient: {
      name: 'Maria',
      phone: '5511999999999',
      email: 'maria@test.com',
    },
    dentist: { name: 'Dr. Carlos' },
    service: { name: 'Limpeza' },
    clinic: {
      name: 'Clinica Test',
      aiSettings: {
        reminder_enabled: true,
        reminder_24h: true,
        reminder_message_24h: null,
        reminder_1h: true,
        reminder_message_1h: null,
      },
    },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    whatsappService = { sendMessage: jest.fn() };
    emailService = { sendAppointmentReminder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppService, useValue: whatsappService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────
  // handleReminders
  // ──────────────────────────────────────────────────
  describe('handleReminders', () => {
    it('should skip if already running', async () => {
      // Set the private isRunning flag to true via reflection
      (service as any).isRunning = true;

      await service.handleReminders();

      // findMany should never be called because the method returns early
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });

    it('should call send24hReminders and send1hReminders (findMany called twice)', async () => {
      // Both private methods call prisma.appointment.findMany once each
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.handleReminders();

      // send24hReminders calls findMany once, send1hReminders calls findMany once
      expect(prisma.appointment.findMany).toHaveBeenCalledTimes(2);
    });

    it('should reset isRunning to false after successful execution', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.handleReminders();

      expect((service as any).isRunning).toBe(false);
    });

    it('should handle errors gracefully and reset isRunning', async () => {
      // Make the first findMany throw an error to simulate a failure
      prisma.appointment.findMany.mockRejectedValueOnce(
        new Error('Database connection lost'),
      );

      // Should not throw -- the error is caught internally
      await expect(service.handleReminders()).resolves.toBeUndefined();

      // isRunning must be reset in the finally block
      expect((service as any).isRunning).toBe(false);
    });

    it('should not send anything when no appointments match', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      await service.handleReminders();

      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
      expect(emailService.sendAppointmentReminder).not.toHaveBeenCalled();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('should send WhatsApp reminder and update appointment when appointment is in 24h window', async () => {
      // Build an appointment exactly 24h from now so it falls within the 23-25h window
      const aptDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const apt24h = {
        ...mockAppointment,
        date: new Date(aptDate.toISOString().split('T')[0]),
        time:
          aptDate.getHours().toString().padStart(2, '0') +
          ':' +
          aptDate.getMinutes().toString().padStart(2, '0'),
      };

      // First findMany (24h) returns the appointment, second (1h) returns empty
      prisma.appointment.findMany
        .mockResolvedValueOnce([apt24h])
        .mockResolvedValueOnce([]);

      whatsappService.sendMessage.mockResolvedValue(true);
      prisma.appointment.update.mockResolvedValue({});

      await service.handleReminders();

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        apt24h.clinic_id,
        apt24h.patient.phone,
        expect.any(String),
      );
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: apt24h.id },
        data: { reminder_sent: true },
      });
    });

    it('should fall back to email when WhatsApp fails', async () => {
      const aptDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const apt24h = {
        ...mockAppointment,
        date: new Date(aptDate.toISOString().split('T')[0]),
        time:
          aptDate.getHours().toString().padStart(2, '0') +
          ':' +
          aptDate.getMinutes().toString().padStart(2, '0'),
      };

      prisma.appointment.findMany
        .mockResolvedValueOnce([apt24h])
        .mockResolvedValueOnce([]);

      // WhatsApp returns false (send failed)
      whatsappService.sendMessage.mockResolvedValue(false);
      // Email succeeds
      emailService.sendAppointmentReminder.mockResolvedValue(true);
      prisma.appointment.update.mockResolvedValue({});

      await service.handleReminders();

      // WhatsApp was attempted first
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        apt24h.clinic_id,
        apt24h.patient.phone,
        expect.any(String),
      );
      // Email fallback was called
      expect(emailService.sendAppointmentReminder).toHaveBeenCalledWith(
        apt24h.clinic_id,
        apt24h.patient.email,
        apt24h.patient.name,
        apt24h.clinic.name,
        expect.any(String), // formatted date
        apt24h.time,
        apt24h.service.name,
        apt24h.dentist.name,
      );
      // Appointment was updated after successful email
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: apt24h.id },
        data: { reminder_sent: true },
      });
    });

    it('should not update appointment when both WhatsApp and email fail', async () => {
      const aptDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const apt24h = {
        ...mockAppointment,
        date: new Date(aptDate.toISOString().split('T')[0]),
        time:
          aptDate.getHours().toString().padStart(2, '0') +
          ':' +
          aptDate.getMinutes().toString().padStart(2, '0'),
      };

      prisma.appointment.findMany
        .mockResolvedValueOnce([apt24h])
        .mockResolvedValueOnce([]);

      whatsappService.sendMessage.mockResolvedValue(false);
      emailService.sendAppointmentReminder.mockResolvedValue(false);

      await service.handleReminders();

      // appointment.update should NOT be called since nothing was sent
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('should skip appointment when clinic has reminders disabled', async () => {
      const aptDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const aptDisabled = {
        ...mockAppointment,
        date: new Date(aptDate.toISOString().split('T')[0]),
        time:
          aptDate.getHours().toString().padStart(2, '0') +
          ':' +
          aptDate.getMinutes().toString().padStart(2, '0'),
        clinic: {
          ...mockAppointment.clinic,
          aiSettings: {
            ...mockAppointment.clinic.aiSettings,
            reminder_enabled: false,
          },
        },
      };

      prisma.appointment.findMany
        .mockResolvedValueOnce([aptDisabled])
        .mockResolvedValueOnce([]);

      await service.handleReminders();

      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
      expect(emailService.sendAppointmentReminder).not.toHaveBeenCalled();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('should skip appointment when patient has no phone and no email', async () => {
      const aptDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const aptNoContact = {
        ...mockAppointment,
        date: new Date(aptDate.toISOString().split('T')[0]),
        time:
          aptDate.getHours().toString().padStart(2, '0') +
          ':' +
          aptDate.getMinutes().toString().padStart(2, '0'),
        patient: { name: 'Maria', phone: null, email: null },
      };

      prisma.appointment.findMany
        .mockResolvedValueOnce([aptNoContact])
        .mockResolvedValueOnce([]);

      await service.handleReminders();

      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
      expect(emailService.sendAppointmentReminder).not.toHaveBeenCalled();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('should allow running again after previous execution completes', async () => {
      prisma.appointment.findMany.mockResolvedValue([]);

      // First run
      await service.handleReminders();
      expect(prisma.appointment.findMany).toHaveBeenCalledTimes(2);

      // Second run should also work (isRunning was reset)
      await service.handleReminders();
      expect(prisma.appointment.findMany).toHaveBeenCalledTimes(4);
    });

    it('should process 1h reminders and update reminder_1h_sent', async () => {
      // Build an appointment exactly 1h from now (within the 50-70 min window)
      const aptDate = new Date(now.getTime() + 60 * 60 * 1000);
      const apt1h = {
        ...mockAppointment,
        status: 'confirmed',
        date: new Date(aptDate.toISOString().split('T')[0]),
        time:
          aptDate.getHours().toString().padStart(2, '0') +
          ':' +
          aptDate.getMinutes().toString().padStart(2, '0'),
        reminder_1h_sent: false,
      };

      // First findMany (24h) returns empty, second (1h) returns the appointment
      prisma.appointment.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([apt1h]);

      whatsappService.sendMessage.mockResolvedValue(true);
      prisma.appointment.update.mockResolvedValue({});

      await service.handleReminders();

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        apt1h.clinic_id,
        apt1h.patient.phone,
        expect.any(String),
      );
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: apt1h.id },
        data: { reminder_1h_sent: true },
      });
    });
  });
});
