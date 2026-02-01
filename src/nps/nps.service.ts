import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../integrations/whatsapp.service';

@Injectable()
export class NpsService {
  private readonly logger = new Logger(NpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /**
   * Send NPS survey to a patient after appointment
   */
  async sendSurvey(clinicId: string, appointmentId: string) {
    const appointment: any = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clinic_id: clinicId },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        clinic: { select: { name: true, z_api_instance: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const survey = await this.prisma.npsSurvey.create({
      data: {
        patient_id: appointment.patient.id,
        clinic_id: clinicId,
        appointment_id: appointmentId,
      },
    });

    // Send via WhatsApp if available
    if (appointment.patient.phone && appointment.clinic.z_api_instance) {
      const surveyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/nps/${survey.id}`;
      const message =
        `Olá ${appointment.patient.name}! 😊\n\n` +
        `Gostaríamos de saber como foi sua experiência na *${appointment.clinic.name}*.\n\n` +
        `Por favor, avalie de 0 a 10 clicando no link abaixo:\n${surveyUrl}\n\n` +
        `Sua opinião é muito importante para nós!`;

      try {
        await this.whatsapp.sendMessage(clinicId, appointment.patient.phone, message);
        this.logger.log(`NPS survey sent to ${appointment.patient.name} (${survey.id})`);
      } catch (error) {
        this.logger.error(`Failed to send NPS survey: ${error}`);
      }
    }

    return survey;
  }

  /**
   * Patient responds to NPS survey (public endpoint)
   */
  async respond(surveyId: string, score: number, feedback?: string) {
    const survey = await this.prisma.npsSurvey.findUnique({
      where: { id: surveyId },
      include: { patient: { select: { name: true } } },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    if (survey.answered_at) {
      return { message: 'Survey already answered', survey };
    }

    const updated = await this.prisma.npsSurvey.update({
      where: { id: surveyId },
      data: {
        score,
        feedback: feedback || null,
        answered_at: new Date(),
      },
    });

    return updated;
  }

  /**
   * Get NPS stats for a clinic
   */
  async getStats(clinicId: string, startDate?: Date, endDate?: Date) {
    const where: Record<string, unknown> = {
      clinic_id: clinicId,
      answered_at: { not: null },
    };

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      where.sent_at = dateFilter;
    }

    const surveys = await this.prisma.npsSurvey.findMany({
      where: where as any,
      select: { score: true, sent_at: true },
      orderBy: { sent_at: 'asc' },
    });

    if (surveys.length === 0) {
      return {
        total_responses: 0,
        nps_score: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        promoter_pct: 0,
        passive_pct: 0,
        detractor_pct: 0,
        monthly: [],
      };
    }

    let promoters = 0;
    let passives = 0;
    let detractors = 0;

    for (const s of surveys) {
      if (s.score !== null) {
        if (s.score >= 9) promoters++;
        else if (s.score >= 7) passives++;
        else detractors++;
      }
    }

    const total = surveys.length;
    const npsScore = Math.round(((promoters - detractors) / total) * 100);

    // Monthly breakdown
    const monthlyMap = new Map<string, { promoters: number; passives: number; detractors: number; total: number }>();
    for (const s of surveys) {
      const key = `${s.sent_at.getFullYear()}-${String(s.sent_at.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { promoters: 0, passives: 0, detractors: 0, total: 0 });
      }
      const m = monthlyMap.get(key)!;
      m.total++;
      if (s.score !== null) {
        if (s.score >= 9) m.promoters++;
        else if (s.score >= 7) m.passives++;
        else m.detractors++;
      }
    }

    const monthly = Array.from(monthlyMap.entries()).map(([month, data]) => ({
      month,
      nps: Math.round(((data.promoters - data.detractors) / data.total) * 100),
      responses: data.total,
    }));

    return {
      total_responses: total,
      nps_score: npsScore,
      promoters,
      passives,
      detractors,
      promoter_pct: Math.round((promoters / total) * 100),
      passive_pct: Math.round((passives / total) * 100),
      detractor_pct: Math.round((detractors / total) * 100),
      monthly,
    };
  }

  /**
   * List NPS responses for a clinic
   */
  async getResponses(clinicId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100);

    const [data, total] = await Promise.all([
      this.prisma.npsSurvey.findMany({
        where: { clinic_id: clinicId },
        include: {
          patient: { select: { name: true, phone: true } },
        },
        orderBy: { sent_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.npsSurvey.count({ where: { clinic_id: clinicId } }),
    ]);

    return {
      data,
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    };
  }

  /**
   * Get survey by ID (for public response page)
   */
  async getSurveyById(surveyId: string) {
    const survey = await this.prisma.npsSurvey.findUnique({
      where: { id: surveyId },
      include: {
        patient: { select: { name: true } },
      },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    // Also fetch clinic name
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: survey.clinic_id },
      select: { name: true, logo_url: true, primary_color: true },
    });

    return { ...survey, clinic };
  }

  /**
   * Auto-send NPS after completed appointments (cron every 30 min)
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async autoSendNps() {
    try {
      // Find appointments completed recently that don't have NPS yet
      const twoHoursAgo = new Date();
      twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

      const thirtyMinAgo = new Date();
      thirtyMinAgo.setMinutes(thirtyMinAgo.getMinutes() - 30);

      // Get all completed appointments in the time window
      const completedAppointments: any[] = await this.prisma.appointment.findMany({
        where: {
          status: 'completed',
          updated_at: { gte: thirtyMinAgo, lte: twoHoursAgo },
        },
        include: {
          clinic: { select: { id: true, z_api_instance: true } },
        },
        take: 50,
      });

      for (const apt of completedAppointments) {
        // Check if NPS already exists for this appointment
        const existingNps = await this.prisma.npsSurvey.findFirst({
          where: { appointment_id: apt.id },
        });

        if (!existingNps && apt.clinic.z_api_instance) {
          try {
            await this.sendSurvey(apt.clinic.id, apt.id);
          } catch (error) {
            this.logger.error(`Auto NPS failed for appointment ${apt.id}: ${error}`);
          }
        }
      }

      if (completedAppointments.length > 0) {
        this.logger.log(`Auto NPS: checked ${completedAppointments.length} appointments`);
      }
    } catch (error) {
      this.logger.error(`Auto NPS cron error: ${error}`);
    }
  }
}
