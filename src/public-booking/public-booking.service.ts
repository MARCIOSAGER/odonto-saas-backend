import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreatePublicBookingDto, PatientInputDto } from './dto';

export interface AvailableSlot {
  time: string;
  dentist_id: string | null;
  dentist_name: string | null;
}

interface DentistSchedule {
  dentist_id: string;
  dentist: { id: string; name: string };
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  slot_duration: number;
}

@Injectable()
export class PublicBookingService {
  private readonly logger = new Logger(PublicBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Get clinic info by slug for public booking page
   */
  async getClinicBySlug(slug: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo_url: true,
        favicon_url: true,
        primary_color: true,
        secondary_color: true,
        slogan: true,
        tagline: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        business_hours: true,
        public_booking_enabled: true,
      },
    });

    if (!clinic) {
      throw new NotFoundException('Clínica não encontrada');
    }

    if (!clinic.public_booking_enabled) {
      throw new ForbiddenException('Agendamento online não está habilitado para esta clínica');
    }

    return clinic;
  }

  /**
   * Get active services for the clinic
   */
  async getServices(clinicId: string) {
    return this.prisma.service.findMany({
      where: {
        clinic_id: clinicId,
        status: 'active',
      },
      select: {
        id: true,
        name: true,
        description: true,
        duration: true,
        price: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get active dentists for the clinic
   */
  async getDentists(clinicId: string) {
    return this.prisma.dentist.findMany({
      where: {
        clinic_id: clinicId,
        status: 'active',
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        specialty: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get available time slots for a specific date
   */
  async getAvailableSlots(clinicId: string, date: string, serviceId: string, dentistId?: string) {
    const parsedDate = new Date(date + 'T00:00:00');
    const dayOfWeek = parsedDate.getDay(); // 0 = Sunday

    // Get service duration
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, clinic_id: clinicId, status: 'active' },
    });
    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }
    const serviceDuration = service.duration;

    // Get dentist schedules for this day
    const scheduleWhere: any = {
      day_of_week: dayOfWeek,
      is_active: true,
      dentist: {
        clinic_id: clinicId,
        status: 'active',
        deleted_at: null,
      },
      OR: [{ valid_from: null }, { valid_from: { lte: parsedDate } }],
      AND: [
        {
          OR: [{ valid_until: null }, { valid_until: { gte: parsedDate } }],
        },
      ],
    };

    if (dentistId) {
      scheduleWhere.dentist_id = dentistId;
    }

    const schedules = await this.prisma.dentistSchedule.findMany({
      where: scheduleWhere,
      include: {
        dentist: { select: { id: true, name: true } },
      },
    });

    if (schedules.length === 0) {
      return {
        date,
        service_duration: serviceDuration,
        available_slots: [],
        clinic_business_hours: null,
      };
    }

    // Get existing appointments for this date
    const startOfDay = new Date(parsedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(parsedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        deleted_at: null,
        date: { gte: startOfDay, lte: endOfDay },
        status: { notIn: ['cancelled'] },
        ...(dentistId && { dentist_id: dentistId }),
      },
      select: { time: true, duration: true, dentist_id: true },
    });

    // Generate slots for each dentist
    const allSlots: AvailableSlot[] = [];

    for (const schedule of schedules) {
      const dentistAppointments = existingAppointments.filter(
        (a) => a.dentist_id === schedule.dentist_id,
      );

      const slots = this.generateSlotsForSchedule(
        schedule as any,
        serviceDuration,
        dentistAppointments,
        parsedDate,
      );

      for (const time of slots) {
        allSlots.push({
          time,
          dentist_id: schedule.dentist.id,
          dentist_name: schedule.dentist.name,
        });
      }
    }

    // Sort by time
    allSlots.sort((a, b) => a.time.localeCompare(b.time));

    // If not filtering by dentist, return unique times (any dentist available)
    if (!dentistId) {
      const uniqueTimes = new Map<string, AvailableSlot>();
      for (const slot of allSlots) {
        if (!uniqueTimes.has(slot.time)) {
          uniqueTimes.set(slot.time, slot);
        }
      }
      return {
        date,
        service_duration: serviceDuration,
        available_slots: Array.from(uniqueTimes.values()),
        clinic_business_hours: null,
      };
    }

    return {
      date,
      service_duration: serviceDuration,
      available_slots: allSlots,
      clinic_business_hours: null,
    };
  }

  /**
   * Generate time slots for a dentist schedule
   */
  private generateSlotsForSchedule(
    schedule: DentistSchedule,
    serviceDuration: number,
    existingAppointments: Array<{ time: string; duration: number }>,
    date: Date,
  ): string[] {
    const slots: string[] = [];

    const [startHour, startMin] = schedule.start_time.split(':').map(Number);
    const [endHour, endMin] = schedule.end_time.split(':').map(Number);
    const slotDuration = schedule.slot_duration || 30;

    // Parse break times if exists
    let breakStart: number | null = null;
    let breakEnd: number | null = null;
    if (schedule.break_start && schedule.break_end) {
      const [bsH, bsM] = schedule.break_start.split(':').map(Number);
      const [beH, beM] = schedule.break_end.split(':').map(Number);
      breakStart = bsH * 60 + bsM;
      breakEnd = beH * 60 + beM;
    }

    // Create a set of booked time ranges
    const bookedRanges: Array<{ start: number; end: number }> = [];
    for (const apt of existingAppointments) {
      const [h, m] = apt.time.split(':').map(Number);
      const startMinutes = h * 60 + m;
      bookedRanges.push({
        start: startMinutes,
        end: startMinutes + apt.duration,
      });
    }

    // Check if date is today for filtering past times
    const now = new Date();
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Generate slots
    let currentSlotMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    while (currentSlotMinutes + serviceDuration <= endMinutes) {
      const slotStart = currentSlotMinutes;
      const slotEnd = currentSlotMinutes + serviceDuration;

      // Check if slot is during break
      const isDuringBreak =
        breakStart !== null &&
        breakEnd !== null &&
        !(slotEnd <= breakStart || slotStart >= breakEnd);

      // Check if slot conflicts with existing appointment
      const hasConflict = bookedRanges.some(
        (range) => !(slotEnd <= range.start || slotStart >= range.end),
      );

      // Check if slot is in the past (for today)
      const isPast = isToday && currentSlotMinutes < currentMinutes + 30; // 30 min buffer

      if (!isDuringBreak && !hasConflict && !isPast) {
        const hours = Math.floor(currentSlotMinutes / 60);
        const mins = currentSlotMinutes % 60;
        slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
      }

      currentSlotMinutes += slotDuration;
    }

    return slots;
  }

  /**
   * Create a public booking
   */
  async createBooking(clinicId: string, dto: CreatePublicBookingDto) {
    // Validate service exists
    const service = await this.prisma.service.findFirst({
      where: { id: dto.service_id, clinic_id: clinicId, status: 'active' },
    });
    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }

    // Validate dentist if provided
    if (dto.dentist_id) {
      const dentist = await this.prisma.dentist.findFirst({
        where: {
          id: dto.dentist_id,
          clinic_id: clinicId,
          status: 'active',
          deleted_at: null,
        },
      });
      if (!dentist) {
        throw new NotFoundException('Dentista não encontrado');
      }
    }

    // Check slot availability (race condition protection)
    const parsedDate = new Date(dto.date + 'T00:00:00');
    const startOfDay = new Date(parsedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(parsedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointment = await this.prisma.appointment.findFirst({
      where: {
        clinic_id: clinicId,
        date: { gte: startOfDay, lte: endOfDay },
        time: dto.time,
        status: { notIn: ['cancelled'] },
        deleted_at: null,
        ...(dto.dentist_id && { dentist_id: dto.dentist_id }),
      },
    });

    if (existingAppointment) {
      throw new ConflictException(
        'Este horário já foi reservado. Por favor, escolha outro horário.',
      );
    }

    // Find or create patient
    const patient = await this.findOrCreatePatient(clinicId, dto.patient);

    // Get clinic info for notifications
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, phone: true },
    });

    // Create appointment
    const appointment = await this.prisma.appointment.create({
      data: {
        clinic_id: clinicId,
        patient_id: patient.id,
        dentist_id: dto.dentist_id || null,
        service_id: dto.service_id,
        date: parsedDate,
        time: dto.time,
        duration: service.duration,
        status: 'scheduled',
        notes: dto.notes || null,
      },
      include: {
        patient: { select: { name: true, phone: true, email: true } },
        dentist: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    // Notify clinic staff
    await this.notifyClinicStaff(clinicId, appointment);

    return {
      appointment_id: appointment.id,
      date: dto.date,
      time: dto.time,
      service_name: appointment.service?.name,
      dentist_name: appointment.dentist?.name || 'Dentista disponível',
      clinic_name: clinic?.name,
      clinic_phone: clinic?.phone,
      confirmation_sent: true,
    };
  }

  /**
   * Find patient by phone or create new one
   */
  private async findOrCreatePatient(clinicId: string, data: PatientInputDto) {
    // Hash phone for search (LGPD compliant)
    const phoneHash = this.encryption.hmac(data.phone);

    // Try to find existing patient
    let patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone_hash: phoneHash,
        deleted_at: null,
      },
    });

    if (!patient) {
      // Create new patient
      patient = await this.prisma.patient.create({
        data: {
          clinic_id: clinicId,
          name: data.name,
          phone: data.phone,
          phone_hash: phoneHash,
          cpf: data.cpf || null,
          cpf_hash: data.cpf ? this.encryption.hmac(data.cpf) : null,
          email: data.email || null,
        },
      });

      this.logger.log(`Created new patient ${patient.id} via public booking`);
    }

    return patient;
  }

  /**
   * Notify clinic staff about new booking
   */
  private async notifyClinicStaff(clinicId: string, appointment: any) {
    try {
      const notifications = await this.notificationsService.notifyClinic(
        clinicId,
        'new_public_booking',
        'Novo agendamento online',
        `${appointment.patient.name} agendou ${appointment.service?.name} para ${appointment.time}`,
        {
          link: '/appointments',
          appointment_id: appointment.id,
          source: 'public_booking',
        },
      );

      for (const notif of notifications) {
        this.notificationsGateway.sendToUser(notif.user_id, notif);
      }
    } catch (error) {
      this.logger.warn(`Failed to notify staff: ${error}`);
    }
  }
}
