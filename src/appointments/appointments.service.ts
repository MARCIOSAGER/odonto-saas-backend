import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

interface FindAllOptions {
  page?: number;
  limit?: number;
  date?: string;
  status?: string;
  dentistId?: string;
  patientId?: string;
  cursor?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(clinicId: string, options: FindAllOptions = {}) {
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
    const { date, status, dentistId, patientId, cursor } = options;

    const where: Record<string, unknown> = { clinic_id: clinicId, deleted_at: null };

    if (status) {
      where.status = status;
    }

    if (dentistId) {
      where.dentist_id = dentistId;
    }

    if (patientId) {
      where.patient_id = patientId;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    const orderBy: any[] = [{ date: 'asc' }, { time: 'asc' }];
    const include = {
      patient: { select: { id: true, name: true, phone: true } },
      dentist: { select: { id: true, name: true, specialty: true } },
      service: { select: { id: true, name: true, price: true, duration: true } },
    };

    // Cursor-based pagination
    if (cursor) {
      const appointments = await this.prisma.appointment.findMany({
        where,
        cursor: { id: cursor },
        skip: 1,
        take: limit + 1,
        orderBy,
        include,
      });

      const hasMore = appointments.length > limit;
      const data = hasMore ? appointments.slice(0, limit) : appointments;

      return {
        data,
        meta: {
          hasMore,
          nextCursor: data.length > 0 ? data[data.length - 1].id : null,
          limit,
        },
      };
    }

    // Offset-based pagination (default)
    const page = Math.max(1, Number(options.page) || 1);
    const skip = Math.max(0, (page - 1) * limit);

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      data: appointments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(clinicId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinic_id: clinicId, deleted_at: null },
      include: {
        patient: true,
        dentist: true,
        service: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  async getToday(clinicId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        deleted_at: null,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      orderBy: { time: 'asc' },
      include: {
        patient: {
          select: { id: true, name: true, phone: true },
        },
        dentist: {
          select: { id: true, name: true },
        },
        service: {
          select: { id: true, name: true, duration: true },
        },
      },
    });
  }

  async getAvailableSlots(clinicId: string, date: string, dentistId?: string, serviceId?: string) {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      clinic_id: clinicId,
      deleted_at: null,
      date: {
        gte: startDate,
        lte: endDate,
      },
      status: { notIn: ['cancelled'] },
    };

    if (dentistId) {
      where.dentist_id = dentistId;
    }

    const existingAppointments = await this.prisma.appointment.findMany({
      where,
      select: { time: true, duration: true },
    });

    let serviceDuration = 30;
    if (serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: serviceId, clinic_id: clinicId },
        select: { duration: true },
      });
      if (service) {
        serviceDuration = service.duration;
      }
    }

    const allSlots = this.generateTimeSlots('08:00', '18:00', 30);
    const bookedTimes = new Set(existingAppointments.map((a) => a.time));
    const availableSlots = allSlots.filter((slot) => !bookedTimes.has(slot));

    return {
      date,
      service_duration: serviceDuration,
      available_slots: availableSlots,
      booked_slots: Array.from(bookedTimes),
    };
  }

  async create(clinicId: string, createAppointmentDto: CreateAppointmentDto, userId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: createAppointmentDto.patient_id, clinic_id: clinicId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const service = await this.prisma.service.findFirst({
      where: { id: createAppointmentDto.service_id, clinic_id: clinicId },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (createAppointmentDto.dentist_id) {
      const dentist = await this.prisma.dentist.findFirst({
        where: { id: createAppointmentDto.dentist_id, clinic_id: clinicId },
      });

      if (!dentist) {
        throw new NotFoundException('Dentist not found');
      }
    }

    const isAvailable = await this.checkAvailability(
      clinicId,
      createAppointmentDto.date,
      createAppointmentDto.time,
      createAppointmentDto.dentist_id,
    );

    if (!isAvailable) {
      throw new ConflictException('Time slot not available');
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        clinic_id: clinicId,
        patient_id: createAppointmentDto.patient_id,
        dentist_id: createAppointmentDto.dentist_id,
        service_id: createAppointmentDto.service_id,
        date: new Date(createAppointmentDto.date),
        time: createAppointmentDto.time,
        duration: service.duration,
        notes: createAppointmentDto.notes,
        status: 'scheduled',
      },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        dentist: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, price: true } },
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Appointment',
      entityId: appointment.id,
      clinicId,
      userId,
      newValues: createAppointmentDto,
    });

    return appointment;
  }

  async update(
    clinicId: string,
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
    userId: string,
  ) {
    const appointment = await this.findOne(clinicId, id);

    if (updateAppointmentDto.date || updateAppointmentDto.time || updateAppointmentDto.dentist_id) {
      const isAvailable = await this.checkAvailability(
        clinicId,
        updateAppointmentDto.date || appointment.date.toISOString().split('T')[0],
        updateAppointmentDto.time || appointment.time,
        updateAppointmentDto.dentist_id || appointment.dentist_id,
        id,
      );

      if (!isAvailable) {
        throw new ConflictException('Time slot not available');
      }
    }

    const data: Record<string, unknown> = { ...updateAppointmentDto };
    if (updateAppointmentDto.date) {
      data.date = new Date(updateAppointmentDto.date);
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        dentist: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, price: true } },
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Appointment',
      entityId: id,
      clinicId,
      userId,
      oldValues: appointment,
      newValues: updateAppointmentDto,
    });

    return updated;
  }

  async cancel(clinicId: string, id: string, reason: string, userId: string) {
    const appointment = await this.findOne(clinicId, id);

    if (appointment.status === 'cancelled') {
      throw new BadRequestException('Appointment already cancelled');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancel_reason: reason,
        cancelled_at: new Date(),
      },
    });

    await this.auditService.log({
      action: 'CANCEL',
      entity: 'Appointment',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: appointment.status },
      newValues: { status: 'cancelled', cancel_reason: reason },
    });

    return updated;
  }

  async confirm(clinicId: string, id: string, userId: string) {
    const appointment = await this.findOne(clinicId, id);

    if (appointment.status !== 'scheduled') {
      throw new BadRequestException('Only scheduled appointments can be confirmed');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: 'confirmed',
        confirmed_at: new Date(),
      },
    });

    await this.auditService.log({
      action: 'CONFIRM',
      entity: 'Appointment',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: appointment.status },
      newValues: { status: 'confirmed' },
    });

    return updated;
  }

  async complete(clinicId: string, id: string, notes: string, userId: string) {
    const appointment = await this.findOne(clinicId, id);

    if (appointment.status === 'cancelled') {
      throw new BadRequestException('Cannot complete cancelled appointment');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: 'completed',
        notes: notes || appointment.notes,
      },
    });

    await this.prisma.patient.update({
      where: { id: appointment.patient_id },
      data: { last_visit: new Date() },
    });

    await this.auditService.log({
      action: 'COMPLETE',
      entity: 'Appointment',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: appointment.status },
      newValues: { status: 'completed' },
    });

    return updated;
  }

  async softDelete(clinicId: string, id: string, userId: string) {
    const appointment = await this.findOne(clinicId, id);

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Appointment',
      entityId: id,
      clinicId,
      userId,
      oldValues: { deleted_at: null },
      newValues: { deleted_at: updated.deleted_at },
    });

    return { message: 'Appointment deleted successfully' };
  }

  async restore(clinicId: string, id: string, userId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinic_id: clinicId, deleted_at: { not: null } },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found or not deleted');
    }

    const restored = await this.prisma.appointment.update({
      where: { id },
      data: { deleted_at: null },
    });

    await this.auditService.log({
      action: 'RESTORE',
      entity: 'Appointment',
      entityId: id,
      clinicId,
      userId,
      oldValues: { deleted_at: appointment.deleted_at },
      newValues: { deleted_at: null },
    });

    return restored;
  }

  private async checkAvailability(
    clinicId: string,
    date: string,
    time: string,
    dentistId?: string | null,
    excludeId?: string,
  ): Promise<boolean> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      clinic_id: clinicId,
      deleted_at: null,
      date: {
        gte: startDate,
        lte: endDate,
      },
      time,
      status: { notIn: ['cancelled'] },
    };

    if (dentistId) {
      where.dentist_id = dentistId;
    }

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const existing = await this.prisma.appointment.findFirst({ where });
    return !existing;
  }

  private generateTimeSlots(start: string, end: string, intervalMinutes: number): string[] {
    const slots: string[] = [];
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    let currentHour = startHour;
    let currentMin = startMin;

    while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
      const formattedTime = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;
      slots.push(formattedTime);

      currentMin += intervalMinutes;
      if (currentMin >= 60) {
        currentHour += Math.floor(currentMin / 60);
        currentMin = currentMin % 60;
      }
    }

    return slots;
  }
}
