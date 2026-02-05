import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

interface FindAllOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  cursor?: string;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  async findAll(clinicId: string, options: FindAllOptions = {}) {
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
    const { search, status, cursor } = options;

    const where: Record<string, unknown> = { clinic_id: clinicId, deleted_at: null };

    if (status) {
      where.status = status;
    }

    if (search) {
      const digitsOnly = search.replace(/\D/g, '');
      const conditions: Record<string, unknown>[] = [
        { name: { contains: search, mode: 'insensitive' } },
      ];

      if (digitsOnly.length >= 4) {
        const digitsHash = this.encryption.hmac(digitsOnly);
        conditions.push({ phone_hash: digitsHash });
        conditions.push({ cpf_hash: digitsHash });
      }

      if (search.includes('@')) {
        const emailHash = this.encryption.hmac(search.trim().toLowerCase());
        conditions.push({ email_hash: emailHash });
      }

      where.OR = conditions;
    }

    // Cursor-based pagination
    if (cursor) {
      const patients = await this.prisma.patient.findMany({
        where,
        cursor: { id: cursor },
        skip: 1,
        take: limit + 1,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { appointments: true } },
        },
      });

      const hasMore = patients.length > limit;
      const data = hasMore ? patients.slice(0, limit) : patients;

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

    const [patients, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: { appointments: true },
          },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data: patients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(clinicId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinic_id: clinicId, deleted_at: null },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  async findByPhone(clinicId: string, phone: string) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const phoneHash = this.encryption.hmac(normalizedPhone);

    const patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone_hash: phoneHash,
        deleted_at: null,
      },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  async findOrCreateByPhone(clinicId: string, phone: string, name?: string) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const phoneHash = this.encryption.hmac(normalizedPhone);

    let patient = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone_hash: phoneHash,
        deleted_at: null,
      },
    });

    if (!patient) {
      patient = await this.prisma.patient.create({
        data: {
          clinic_id: clinicId,
          phone: normalizedPhone,
          name: name || 'Novo Paciente',
          status: 'active',
        },
      });
    }

    return patient;
  }

  async create(clinicId: string, createPatientDto: CreatePatientDto, userId: string) {
    const normalizedPhone = createPatientDto.phone.replace(/\D/g, '');
    const phoneHash = this.encryption.hmac(normalizedPhone);

    const existing = await this.prisma.patient.findFirst({
      where: {
        clinic_id: clinicId,
        phone_hash: phoneHash,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new ConflictException('Patient with this phone already exists');
    }

    const patient = await this.prisma.patient.create({
      data: {
        clinic_id: clinicId,
        name: createPatientDto.name,
        phone: normalizedPhone,
        cpf: createPatientDto.cpf,
        email: createPatientDto.email,
        birth_date: createPatientDto.birth_date
          ? new Date(createPatientDto.birth_date + 'T00:00:00.000Z')
          : undefined,
        address: createPatientDto.address,
        notes: createPatientDto.notes,
        status: 'active',
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'Patient',
      entityId: patient.id,
      clinicId,
      userId,
      newValues: createPatientDto,
    });

    return patient;
  }

  async update(clinicId: string, id: string, updatePatientDto: UpdatePatientDto, userId: string) {
    const patient = await this.findOne(clinicId, id);

    if (updatePatientDto.phone) {
      const normalizedPhone = updatePatientDto.phone.replace(/\D/g, '');
      const phoneHash = this.encryption.hmac(normalizedPhone);

      const existing = await this.prisma.patient.findFirst({
        where: {
          clinic_id: clinicId,
          phone_hash: phoneHash,
          id: { not: id },
          deleted_at: null,
        },
      });

      if (existing) {
        throw new ConflictException('Another patient with this phone already exists');
      }

      updatePatientDto.phone = normalizedPhone;
    }

    const updateData: any = { ...updatePatientDto };
    if (updateData.birth_date && typeof updateData.birth_date === 'string') {
      updateData.birth_date = new Date(updateData.birth_date + 'T00:00:00.000Z');
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data: updateData,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Patient',
      entityId: id,
      clinicId,
      userId,
      oldValues: patient,
      newValues: updatePatientDto,
    });

    return updated;
  }

  async remove(clinicId: string, id: string, userId: string) {
    const patient = await this.findOne(clinicId, id);

    const updated = await this.prisma.patient.update({
      where: { id },
      data: { status: 'inactive', deleted_at: new Date() },
    });

    await this.auditService.log({
      action: 'DELETE',
      entity: 'Patient',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: patient.status, deleted_at: null },
      newValues: { status: 'inactive', deleted_at: updated.deleted_at },
    });

    return updated;
  }

  async restore(clinicId: string, id: string, userId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinic_id: clinicId, deleted_at: { not: null } },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found or not deleted');
    }

    const restored = await this.prisma.patient.update({
      where: { id },
      data: { status: 'active', deleted_at: null },
    });

    await this.auditService.log({
      action: 'RESTORE',
      entity: 'Patient',
      entityId: id,
      clinicId,
      userId,
      oldValues: { status: patient.status, deleted_at: patient.deleted_at },
      newValues: { status: 'active', deleted_at: null },
    });

    return restored;
  }

  async getAppointments(clinicId: string, patientId: string, limit = 10) {
    await this.findOne(clinicId, patientId);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        patient_id: patientId,
      },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        service: {
          select: { id: true, name: true, price: true },
        },
        dentist: {
          select: { id: true, name: true, specialty: true },
        },
      },
    });

    return appointments;
  }

  async getFinancialSummary(clinicId: string, patientId: string) {
    await this.findOne(clinicId, patientId);

    const [appointments, treatmentPlans] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { clinic_id: clinicId, patient_id: patientId },
        orderBy: { date: 'desc' },
        include: {
          service: { select: { id: true, name: true, price: true } },
          dentist: { select: { id: true, name: true } },
        },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { clinic_id: clinicId, patient_id: patientId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          status: true,
          total_cost: true,
          total_sessions: true,
          created_at: true,
          notes: true,
        },
      }),
    ]);

    let completedTotal = 0;
    let pendingTotal = 0;
    let cancelledTotal = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;

    for (const apt of appointments) {
      const price = Number(apt.service?.price) || 0;
      if (apt.status === 'completed') {
        completedTotal += price;
        completedCount++;
      } else if (apt.status === 'cancelled') {
        cancelledTotal += price;
        cancelledCount++;
      } else {
        pendingTotal += price;
        pendingCount++;
      }
    }

    let treatmentPlanTotal = 0;
    let activePlansCount = 0;
    for (const plan of treatmentPlans) {
      const cost = Number(plan.total_cost) || 0;
      treatmentPlanTotal += cost;
      if (plan.status === 'pending' || plan.status === 'in_progress') {
        activePlansCount++;
      }
    }

    return {
      summary: {
        completed_total: completedTotal,
        pending_total: pendingTotal,
        cancelled_total: cancelledTotal,
        completed_count: completedCount,
        pending_count: pendingCount,
        cancelled_count: cancelledCount,
        treatment_plan_total: treatmentPlanTotal,
        active_plans_count: activePlansCount,
        total_appointments: appointments.length,
      },
      appointments,
      treatment_plans: treatmentPlans,
    };
  }

  async getTimeline(clinicId: string, patientId: string) {
    await this.findOne(clinicId, patientId);

    const [appointments, prescriptions, anamneses, treatmentPlans, odontogram] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { clinic_id: clinicId, patient_id: patientId },
        orderBy: { date: 'desc' },
        include: {
          service: { select: { name: true, price: true } },
          dentist: { select: { name: true } },
        },
      }),
      this.prisma.prescription.findMany({
        where: { clinic_id: clinicId, patient_id: patientId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          type: true,
          pdf_url: true,
          sent_at: true,
          sent_via: true,
          created_at: true,
          dentist: { select: { name: true } },
        },
      }),
      this.prisma.anamnesis.findMany({
        where: { clinic_id: clinicId, patient_id: patientId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          risk_classification: true,
          alerts: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { clinic_id: clinicId, patient_id: patientId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          status: true,
          total_cost: true,
          total_sessions: true,
          notes: true,
          created_at: true,
        },
      }),
      this.prisma.odontogram.findFirst({
        where: { patient_id: patientId },
        include: {
          entries: {
            where: { superseded_at: null },
            orderBy: { created_at: 'desc' },
            take: 20,
          },
        },
      }),
    ]);

    const events: {
      id: string;
      type: string;
      date: string;
      title: string;
      description: string;
      meta?: Record<string, unknown>;
    }[] = [];

    for (const apt of appointments) {
      events.push({
        id: apt.id,
        type: 'appointment',
        date: apt.date instanceof Date ? apt.date.toISOString() : String(apt.date),
        title: apt.service?.name || 'Consulta',
        description: `${apt.status === 'completed' ? 'Concluída' : apt.status === 'cancelled' ? 'Cancelada' : apt.status === 'confirmed' ? 'Confirmada' : 'Agendada'} às ${apt.time}${apt.dentist ? ` com Dr(a). ${apt.dentist.name}` : ''}`,
        meta: {
          status: apt.status,
          price: apt.service?.price,
          dentist: apt.dentist?.name,
          notes: apt.notes,
        },
      });
    }

    for (const rx of prescriptions) {
      const typeLabel =
        rx.type === 'prescription'
          ? 'Receita'
          : rx.type === 'certificate'
            ? 'Atestado'
            : 'Encaminhamento';
      events.push({
        id: rx.id,
        type: 'prescription',
        date: rx.created_at instanceof Date ? rx.created_at.toISOString() : String(rx.created_at),
        title: typeLabel,
        description: `Emitida por Dr(a). ${rx.dentist?.name || 'N/A'}${rx.sent_via ? ` — enviada via ${rx.sent_via}` : ''}`,
        meta: {
          subtype: rx.type,
          pdf_url: rx.pdf_url,
          sent_at: rx.sent_at,
        },
      });
    }

    for (const a of anamneses) {
      events.push({
        id: a.id,
        type: 'anamnesis',
        date: a.created_at instanceof Date ? a.created_at.toISOString() : String(a.created_at),
        title: 'Anamnese',
        description: `Classificação: ${a.risk_classification || 'não definida'}${(a.alerts as unknown as string[])?.length ? ` — ${(a.alerts as unknown as string[]).length} alerta(s)` : ''}`,
        meta: {
          risk_classification: a.risk_classification,
          alerts: a.alerts,
        },
      });
    }

    for (const tp of treatmentPlans) {
      const statusLabel =
        tp.status === 'pending'
          ? 'Pendente'
          : tp.status === 'in_progress'
            ? 'Em andamento'
            : tp.status === 'completed'
              ? 'Concluído'
              : 'Cancelado';
      events.push({
        id: tp.id,
        type: 'treatment_plan',
        date: tp.created_at instanceof Date ? tp.created_at.toISOString() : String(tp.created_at),
        title: 'Plano de Tratamento',
        description: `${statusLabel}${tp.total_cost ? ` — R$ ${Number(tp.total_cost).toFixed(2)}` : ''}${tp.total_sessions ? ` (${tp.total_sessions} sessões)` : ''}`,
        meta: {
          status: tp.status,
          total_cost: tp.total_cost,
          total_sessions: tp.total_sessions,
          notes: tp.notes,
        },
      });
    }

    if (odontogram?.entries) {
      for (const entry of odontogram.entries) {
        events.push({
          id: `entry-${entry.tooth_number}-${entry.created_at}`,
          type: 'odontogram',
          date:
            entry.created_at instanceof Date
              ? entry.created_at.toISOString()
              : String(entry.created_at),
          title: `Dente ${entry.tooth_number}`,
          description: `${entry.entry_type}: ${entry.status_code} [${(entry.surfaces || []).join(',')}]${entry.notes ? ` — ${entry.notes}` : ''}`,
          meta: {
            tooth_number: entry.tooth_number,
            status_code: entry.status_code,
            entry_type: entry.entry_type,
          },
        });
      }
    }

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { events, total: events.length };
  }
}
