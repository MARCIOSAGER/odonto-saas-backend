import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Query audit logs (admin only)' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async queryLogs(@CurrentUser() user: any, @Query() query: QueryAuditLogsDto) {
    const { page = 1, limit = 50, userId, action, entity, entityId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      clinic_id: user.clinicId,
    };

    if (userId) where.user_id = userId;
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (entityId) where.entity_id = entityId;

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }

    // Execute query with pagination
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
