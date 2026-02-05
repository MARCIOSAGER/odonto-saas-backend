import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientPortalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get patient data by portal token (public access, no auth required)
   */
  async getByToken(token: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { portal_token: token },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        birth_date: true,
        clinic_id: true,
        portal_token_expires: true,
        clinic: {
          select: {
            name: true,
            phone: true,
            address: true,
            city: true,
            state: true,
            logo_url: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Portal não encontrado');
    }

    // Check expiration if set
    if (patient.portal_token_expires && patient.portal_token_expires < new Date()) {
      throw new NotFoundException('Portal expirado');
    }

    return patient;
  }

  /**
   * Get patient appointments (upcoming + recent)
   */
  async getAppointments(token: string) {
    const patient = await this.getPatientByToken(token);
    const now = new Date();

    const [upcoming, recent] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          patient_id: patient.id,
          date: { gte: new Date(now.toISOString().split('T')[0]) },
          status: { in: ['scheduled', 'confirmed'] },
        },
        orderBy: { date: 'asc' },
        take: 10,
        include: {
          service: { select: { name: true, duration: true } },
          dentist: { select: { name: true, specialty: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          patient_id: patient.id,
          status: 'completed',
        },
        orderBy: { date: 'desc' },
        take: 10,
        include: {
          service: { select: { name: true } },
          dentist: { select: { name: true } },
        },
      }),
    ]);

    return { upcoming, recent };
  }

  /**
   * Get patient prescriptions
   */
  async getPrescriptions(token: string) {
    const patient = await this.getPatientByToken(token);

    return this.prisma.prescription.findMany({
      where: { patient_id: patient.id },
      orderBy: { created_at: 'desc' },
      include: {
        dentist: { select: { name: true, cro: true } },
      },
    });
  }

  /**
   * Regenerate portal token for a patient (authenticated endpoint)
   */
  async regenerateToken(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinic_id: clinicId },
    });

    if (!patient) {
      throw new NotFoundException('Paciente não encontrado');
    }

    // Generate new UUID token + set 90-day expiration
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const updated = (await this.prisma.$queryRaw`
      UPDATE "Patient"
      SET portal_token = gen_random_uuid()::text,
          portal_token_expires = ${expiresAt}
      WHERE id = ${patientId}
      RETURNING portal_token
    `) as { portal_token: string }[];

    return { portal_token: updated[0]?.portal_token };
  }

  /**
   * Get portal link for a patient
   */
  async getPortalLink(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinic_id: clinicId },
      select: { portal_token: true },
    });

    if (!patient) {
      throw new NotFoundException('Paciente não encontrado');
    }

    return { token: patient.portal_token };
  }

  private async getPatientByToken(token: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { portal_token: token },
      select: { id: true, clinic_id: true, portal_token_expires: true },
    });

    if (!patient) {
      throw new NotFoundException('Portal não encontrado');
    }

    // Check expiration if set
    if (patient.portal_token_expires && patient.portal_token_expires < new Date()) {
      throw new NotFoundException('Portal expirado');
    }

    return patient;
  }
}
