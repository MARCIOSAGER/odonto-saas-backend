import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

export const PLAN_LIMIT_KEY = 'planLimit';

/**
 * Decorator to check plan limits before allowing an action
 * Usage: @CheckPlanLimit('patients') or @CheckPlanLimit('dentists') or @CheckPlanLimit('appointments')
 */
export function CheckPlanLimit(resource: 'patients' | 'dentists' | 'appointments') {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(PLAN_LIMIT_KEY, resource, descriptor.value);
    return descriptor;
  };
}

@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.get<string>(
      PLAN_LIMIT_KEY,
      context.getHandler(),
    );

    if (!resource) {
      return true; // No plan limit check required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.clinicId) {
      return true; // No clinic context, skip check
    }

    // Superadmin bypasses limits
    if (user.role === 'superadmin') {
      return true;
    }

    // Get active subscription
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        clinic_id: user.clinicId,
        status: { in: ['active', 'trialing'] },
      },
      include: { plan: true },
    });

    if (!subscription) {
      throw new ForbiddenException(
        'Nenhuma assinatura ativa encontrada. Atualize seu plano para continuar.',
      );
    }

    // Check if subscription has expired (trial or cancelled)
    if (
      subscription.status === 'trialing' &&
      subscription.trial_end &&
      new Date() > subscription.trial_end
    ) {
      throw new ForbiddenException(
        'Seu período de teste expirou. Atualize seu plano para continuar.',
      );
    }

    const plan = subscription.plan;

    switch (resource) {
      case 'patients': {
        if (plan.max_patients === null) return true; // unlimited
        const count = await this.prisma.patient.count({
          where: { clinic_id: user.clinicId, status: 'active' },
        });
        if (count >= plan.max_patients) {
          throw new ForbiddenException(
            `Limite de ${plan.max_patients} pacientes atingido no plano ${plan.display_name || plan.name}. Faça upgrade para continuar.`,
          );
        }
        return true;
      }

      case 'dentists': {
        if (plan.max_dentists === null) return true;
        const count = await this.prisma.dentist.count({
          where: { clinic_id: user.clinicId, status: 'active' },
        });
        if (count >= plan.max_dentists) {
          throw new ForbiddenException(
            `Limite de ${plan.max_dentists} dentistas atingido no plano ${plan.display_name || plan.name}. Faça upgrade para continuar.`,
          );
        }
        return true;
      }

      case 'appointments': {
        if (plan.max_appointments_month === null) return true;
        const startOfMonth = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        );
        const count = await this.prisma.appointment.count({
          where: {
            clinic_id: user.clinicId,
            date: { gte: startOfMonth },
          },
        });
        if (count >= plan.max_appointments_month) {
          throw new ForbiddenException(
            `Limite de ${plan.max_appointments_month} agendamentos/mês atingido no plano ${plan.display_name || plan.name}. Faça upgrade para continuar.`,
          );
        }
        return true;
      }

      default:
        return true;
    }
  }
}
