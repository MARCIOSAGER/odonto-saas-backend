import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // =====================
  // STATS
  // =====================

  async getStats() {
    const [
      totalClinics,
      activeClinics,
      totalUsers,
      activeUsers,
    ] = await Promise.all([
      this.prisma.clinic.count(),
      this.prisma.clinic.count({ where: { status: 'active' } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'active' } }),
    ]);

    return {
      total_clinics: totalClinics,
      active_clinics: activeClinics,
      inactive_clinics: totalClinics - activeClinics,
      total_users: totalUsers,
      active_users: activeUsers,
    };
  }

  // =====================
  // USERS
  // =====================

  async findAllUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
    clinic_id?: string;
  }) {
    const { search, role, status, clinic_id } = options;
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (clinic_id) where.clinic_id = clinic_id;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          two_factor_enabled: true,
          created_at: true,
          clinic: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        phone: true,
        two_factor_enabled: true,
        two_factor_method: true,
        google_id: true,
        avatar_url: true,
        created_at: true,
        updated_at: true,
        clinic: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async updateUserStatus(id: string, status: string, adminUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (user.id === adminUserId) {
      throw new BadRequestException('Você não pode alterar seu próprio status');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });

    await this.auditService.log({
      action: 'UPDATE_STATUS',
      entity: 'User',
      entityId: id,
      clinicId: user.clinic_id,
      userId: adminUserId,
      oldValues: { status: user.status },
      newValues: { status },
    });

    return updated;
  }

  async updateUserRole(id: string, role: string, adminUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (user.id === adminUserId) {
      throw new BadRequestException('Você não pode alterar seu próprio role');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    await this.auditService.log({
      action: 'UPDATE_ROLE',
      entity: 'User',
      entityId: id,
      clinicId: user.clinic_id,
      userId: adminUserId,
      oldValues: { role: user.role },
      newValues: { role },
    });

    return updated;
  }

  async resetUserPassword(id: string, adminUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.user.update({
      where: { id },
      data: {
        reset_token: hashedToken,
        reset_token_expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const resetLink = `${frontendUrl}/forgot-password/reset?token=${rawToken}`;

    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetLink,
      user.clinic_id ?? undefined,
    );

    await this.auditService.log({
      action: 'ADMIN_RESET_PASSWORD',
      entity: 'User',
      entityId: id,
      clinicId: user.clinic_id,
      userId: adminUserId,
    });

    return { message: 'Email de redefinição de senha enviado' };
  }

  // =====================
  // CLINICS
  // =====================

  async findAllClinics(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const { search, status } = options;
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { cnpj: { contains: search } },
      ];
    }

    const [clinics, total] = await Promise.all([
      this.prisma.clinic.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          _count: {
            select: {
              patients: true,
              dentists: true,
              appointments: true,
              users: true,
            },
          },
        },
      }),
      this.prisma.clinic.count({ where }),
    ]);

    return {
      data: clinics,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateClinicStatus(id: string, status: string, adminUserId: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada');

    const updated = await this.prisma.clinic.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, status: true },
    });

    await this.auditService.log({
      action: 'UPDATE_STATUS',
      entity: 'Clinic',
      entityId: id,
      clinicId: id,
      userId: adminUserId,
      oldValues: { status: clinic.status },
      newValues: { status },
    });

    return updated;
  }
}
