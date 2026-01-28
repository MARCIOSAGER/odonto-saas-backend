import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeService } from '../integrations/claude.service';
import { WhatsAppService } from '../integrations/whatsapp.service';
import { PatientsService } from '../patients/patients.service';

interface MessageContext {
  messageId?: string;
  chatName?: string;
}

@Injectable()
export class ZApiService {
  private readonly logger = new Logger(ZApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeService: ClaudeService,
    private readonly whatsappService: WhatsAppService,
    private readonly patientsService: PatientsService,
  ) {}

  async processMessage(
    instanceId: string | undefined,
    phone: string,
    message: string,
    context: MessageContext,
  ) {
    const normalizedPhone = this.normalizePhone(phone);

    const clinic = await this.findClinicByInstance(instanceId);

    if (!clinic) {
      this.logger.warn(`No clinic found for instance: ${instanceId}`);
      return { processed: false, reason: 'Clinic not found' };
    }

    await this.logMessage(clinic.id, normalizedPhone, 'incoming', message, context.messageId);

    const patient = await this.patientsService.findOrCreateByPhone(
      clinic.id,
      normalizedPhone,
      context.chatName,
    );

    const patientContext = await this.getPatientContext(clinic.id, patient.id);

    const aiResponse = await this.claudeService.processMessage(message, {
      clinicName: clinic.name,
      patientName: patient.name,
      patientHistory: patientContext,
    });

    if (aiResponse) {
      await this.whatsappService.sendMessage(clinic.id, normalizedPhone, aiResponse);
      await this.logMessage(clinic.id, normalizedPhone, 'outgoing', aiResponse);
    }

    return {
      processed: true,
      clinicId: clinic.id,
      patientId: patient.id,
      responseGenerated: !!aiResponse,
    };
  }

  private async findClinicByInstance(instanceId?: string) {
    if (!instanceId) return null;

    return this.prisma.clinic.findFirst({
      where: {
        z_api_instance: instanceId,
        status: 'active',
      },
    });
  }

  private async getPatientContext(clinicId: string, patientId: string) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        patient_id: patientId,
      },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        service: { select: { name: true } },
      },
    });

    const upcomingAppointments = appointments.filter(
      (a) => a.date >= new Date() && a.status !== 'cancelled',
    );

    return {
      totalAppointments: appointments.length,
      upcomingAppointments: upcomingAppointments.map((a) => ({
        date: a.date.toISOString().split('T')[0],
        time: a.time,
        service: a.service.name,
        status: a.status,
      })),
      lastAppointment: appointments[0]
        ? {
            date: appointments[0].date.toISOString().split('T')[0],
            service: appointments[0].service.name,
          }
        : null,
    };
  }

  private async logMessage(
    clinicId: string,
    phone: string,
    direction: 'incoming' | 'outgoing',
    message: string,
    messageId?: string,
  ) {
    try {
      await this.prisma.whatsAppMessage.create({
        data: {
          clinic_id: clinicId,
          phone,
          direction,
          message,
          message_id: messageId,
          status: 'sent',
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log message: ${error}`);
    }
  }

  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/\D/g, '');

    if (normalized.endsWith('@c.us')) {
      normalized = normalized.replace('@c.us', '');
    }

    if (normalized.startsWith('55') && normalized.length > 11) {
      normalized = normalized.substring(2);
    }

    return normalized;
  }
}
