import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const where: Record<string, unknown> = {};
    if (!includeInactive) {
      where.status = 'active';
    }

    return this.prisma.plan.findMany({
      where,
      orderBy: { sort_order: 'asc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  async findByName(name: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { name },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  async create(createPlanDto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({
      where: { name: createPlanDto.name },
    });

    if (existing) {
      throw new ConflictException('Plan with this name already exists');
    }

    return this.prisma.plan.create({
      data: {
        name: createPlanDto.name,
        display_name: createPlanDto.display_name,
        description: createPlanDto.description,
        price_monthly: createPlanDto.price_monthly,
        price_yearly: createPlanDto.price_yearly,
        max_patients: createPlanDto.max_patients ?? null,
        max_dentists: createPlanDto.max_dentists ?? null,
        max_appointments_month: createPlanDto.max_appointments_month ?? null,
        max_whatsapp_messages: createPlanDto.max_whatsapp_messages ?? null,
        features: (createPlanDto.features ?? {}) as Prisma.InputJsonValue,
        ai_enabled: createPlanDto.ai_enabled ?? false,
        ai_messages_limit: createPlanDto.ai_messages_limit ?? null,
        priority_support: createPlanDto.priority_support ?? false,
        custom_branding: createPlanDto.custom_branding ?? false,
        api_access: createPlanDto.api_access ?? false,
        sort_order: createPlanDto.sort_order ?? 0,
        status: 'active',
      },
    });
  }

  async update(id: string, updatePlanDto: UpdatePlanDto) {
    const plan = await this.findOne(id);

    if (updatePlanDto.name && updatePlanDto.name !== plan.name) {
      const existing = await this.prisma.plan.findUnique({
        where: { name: updatePlanDto.name },
      });

      if (existing) {
        throw new ConflictException('Another plan with this name already exists');
      }
    }

    const { features, ...rest } = updatePlanDto;
    const data: Prisma.PlanUpdateInput = { ...rest };
    if (features !== undefined) {
      data.features = features as Prisma.InputJsonValue;
    }

    return this.prisma.plan.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.plan.update({
      where: { id },
      data: { status: 'inactive' },
    });

    return { message: 'Plan deactivated successfully' };
  }
}
