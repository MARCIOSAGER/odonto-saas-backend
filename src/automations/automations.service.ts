import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(clinicId: string) {
    return this.prisma.clinicAutomation.findMany({
      where: { clinic_id: clinicId },
      orderBy: { created_at: 'desc' },
    });
  }

  async findByType(clinicId: string, type: string) {
    return this.prisma.clinicAutomation.findFirst({
      where: { clinic_id: clinicId, type },
    });
  }

  async upsertByType(
    clinicId: string,
    type: string,
    data: {
      name: string;
      trigger_type: string;
      trigger_config: Record<string, unknown>;
      action_type: string;
      action_config: Record<string, unknown>;
      is_active: boolean;
    },
  ) {
    const existing = await this.prisma.clinicAutomation.findFirst({
      where: { clinic_id: clinicId, type },
    });

    if (existing) {
      return this.prisma.clinicAutomation.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          trigger_type: data.trigger_type,
          trigger_config: data.trigger_config as Prisma.InputJsonValue,
          action_type: data.action_type,
          action_config: data.action_config as Prisma.InputJsonValue,
          is_active: data.is_active,
        },
      });
    }

    return this.prisma.clinicAutomation.create({
      data: {
        clinic_id: clinicId,
        type,
        name: data.name,
        trigger_type: data.trigger_type,
        trigger_config: data.trigger_config as Prisma.InputJsonValue,
        action_type: data.action_type,
        action_config: data.action_config as Prisma.InputJsonValue,
        is_active: data.is_active,
      },
    });
  }

  async toggle(clinicId: string, type: string, isActive: boolean) {
    const automation = await this.prisma.clinicAutomation.findFirst({
      where: { clinic_id: clinicId, type },
    });

    if (!automation) return null;

    return this.prisma.clinicAutomation.update({
      where: { id: automation.id },
      data: { is_active: isActive },
    });
  }

  async updateRunStatus(automationId: string, success: boolean, error?: string) {
    const data: Prisma.ClinicAutomationUpdateInput = {
      last_run_at: new Date(),
      run_count: { increment: 1 },
    };

    if (!success) {
      data.error_count = { increment: 1 };
      data.last_error = error || 'Unknown error';
    }

    return this.prisma.clinicAutomation.update({
      where: { id: automationId },
      data,
    });
  }

  async getActiveByType(type: string) {
    return this.prisma.clinicAutomation.findMany({
      where: { type, is_active: true },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            z_api_instance: true,
            z_api_token: true,
          },
        },
      },
    });
  }
}
