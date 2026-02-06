import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HofProcedureType } from '@prisma/client';

interface RecentProceduresFilter {
  limit: number;
  page: number;
  procedureType?: string;
  dentistId?: string;
}

// Default legend colors for HOF procedure types
const DEFAULT_LEGEND: Record<HofProcedureType, { label: string; color: string }> = {
  TOXINA_BOTULINICA: { label: 'Toxina Botulínica', color: '#3B82F6' },
  PREENCHIMENTO_HA: { label: 'Preenchimento HA', color: '#10B981' },
  BIOESTIMULADOR_COLAGENO: { label: 'Bioestimulador de Colágeno', color: '#F59E0B' },
  FIOS_PDO: { label: 'Fios PDO', color: '#8B5CF6' },
  SKINBOOSTER: { label: 'Skinbooster', color: '#EC4899' },
  OUTRO: { label: 'Outro', color: '#6B7280' },
};

@Injectable()
export class HofService {
  private readonly logger = new Logger(HofService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(clinicId: string, startDate?: Date, endDate?: Date) {
    const now = new Date();
    const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Get all sessions in the period
    const sessions = await this.prisma.hofSession.findMany({
      where: {
        clinic_id: clinicId,
        session_date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        entries: true,
      },
    });

    // Calculate metrics
    const totalProcedures = sessions.reduce((acc, session) => acc + session.entries.length, 0);

    const totalRevenue = sessions.reduce((acc, session) => {
      const value = session.total_value ? Number(session.total_value) : 0;
      return acc + value;
    }, 0);

    const uniquePatients = new Set(sessions.map((s) => s.patient_id)).size;

    // Get scheduled sessions (future)
    const scheduledSessions = await this.prisma.hofSession.count({
      where: {
        clinic_id: clinicId,
        status: 'scheduled',
        session_date: {
          gte: now,
        },
      },
    });

    return {
      totalProcedures,
      totalRevenue,
      totalPatients: uniquePatients,
      scheduledSessions,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  async getRecentProcedures(clinicId: string, filters: RecentProceduresFilter) {
    const { limit, page, procedureType, dentistId } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      clinic_id: clinicId,
    };

    if (dentistId) {
      where.dentist_id = dentistId;
    }

    if (procedureType) {
      where.entries = {
        some: {
          procedure_type: procedureType as HofProcedureType,
        },
      };
    }

    const [sessions, total] = await Promise.all([
      this.prisma.hofSession.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              name: true,
            },
          },
          entries: {
            where: {
              superseded_at: null, // Only active entries
            },
            select: {
              id: true,
              facial_region: true,
              procedure_type: true,
              product_name: true,
              quantity: true,
            },
          },
        },
        orderBy: {
          session_date: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.hofSession.count({ where }),
    ]);

    // Transform to flat procedure list
    const procedures = sessions.flatMap((session) =>
      session.entries.map((entry) => ({
        id: entry.id,
        sessionId: session.id,
        date: session.session_date,
        patientId: session.patient_id,
        patientName: session.patient.name,
        procedureType: entry.procedure_type,
        facialRegion: entry.facial_region,
        productName: entry.product_name,
        quantity: entry.quantity,
        dentistId: session.dentist_id,
        status: session.status,
      })),
    );

    return {
      data: procedures,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getLegend(clinicId: string) {
    // Check if clinic has custom legend
    const customLegend = await this.prisma.faceogramLegendItem.findMany({
      where: {
        clinic_id: clinicId,
        is_active: true,
      },
      orderBy: {
        sort_order: 'asc',
      },
    });

    if (customLegend.length > 0) {
      return customLegend;
    }

    // Seed default legend for clinic
    const defaultItems = Object.entries(DEFAULT_LEGEND).map(([type, config], index) => ({
      clinic_id: clinicId,
      procedure_type: type as HofProcedureType,
      label: config.label,
      color: config.color,
      sort_order: index,
      is_active: true,
    }));

    await this.prisma.faceogramLegendItem.createMany({
      data: defaultItems,
      skipDuplicates: true,
    });

    return this.prisma.faceogramLegendItem.findMany({
      where: {
        clinic_id: clinicId,
        is_active: true,
      },
      orderBy: {
        sort_order: 'asc',
      },
    });
  }

  async getRevenueReport(clinicId: string, startDate?: Date, endDate?: Date) {
    const now = new Date();
    const start = startDate || new Date(now.getFullYear(), 0, 1); // Start of year
    const end = endDate || now;

    // Get monthly revenue
    const sessions = await this.prisma.hofSession.findMany({
      where: {
        clinic_id: clinicId,
        session_date: {
          gte: start,
          lte: end,
        },
        status: 'completed',
      },
      select: {
        session_date: true,
        total_value: true,
      },
    });

    // Group by month
    const monthlyRevenue: Record<string, number> = {};
    sessions.forEach((session) => {
      const monthKey = `${session.session_date.getFullYear()}-${String(session.session_date.getMonth() + 1).padStart(2, '0')}`;
      const value = session.total_value ? Number(session.total_value) : 0;
      monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + value;
    });

    // Convert to array
    const data = Object.entries(monthlyRevenue)
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const totalRevenue = data.reduce((acc, item) => acc + item.value, 0);

    return {
      data,
      totalRevenue,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  async getProceduresReport(clinicId: string, startDate?: Date, endDate?: Date) {
    const now = new Date();
    const start = startDate || new Date(now.getFullYear(), 0, 1);
    const end = endDate || now;

    // Get entries in period
    const entries = await this.prisma.faceogramEntry.findMany({
      where: {
        faceogram: {
          clinic_id: clinicId,
        },
        session: {
          session_date: {
            gte: start,
            lte: end,
          },
          status: 'completed',
        },
        superseded_at: null,
      },
      select: {
        procedure_type: true,
      },
    });

    // Count by type
    const counts: Record<string, number> = {};
    entries.forEach((entry) => {
      counts[entry.procedure_type] = (counts[entry.procedure_type] || 0) + 1;
    });

    // Get labels from legend
    const legend = await this.getLegend(clinicId);
    const labelMap = new Map(
      legend.map((l) => [l.procedure_type, { label: l.label, color: l.color }]),
    );

    const data = Object.entries(counts)
      .map(([type, count]) => {
        const legendInfo = labelMap.get(type as HofProcedureType);
        return {
          type,
          label: legendInfo?.label || type,
          color: legendInfo?.color || '#6B7280',
          count,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      data,
      total: entries.length,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  async getProductsReport(clinicId: string, startDate?: Date, endDate?: Date) {
    const now = new Date();
    const start = startDate || new Date(now.getFullYear(), 0, 1);
    const end = endDate || now;

    // Get entries with products
    const entries = await this.prisma.faceogramEntry.findMany({
      where: {
        faceogram: {
          clinic_id: clinicId,
        },
        session: {
          session_date: {
            gte: start,
            lte: end,
          },
          status: 'completed',
        },
        superseded_at: null,
        product_name: {
          not: null,
        },
      },
      select: {
        product_name: true,
        procedure_type: true,
      },
    });

    // Count by product
    const counts: Record<string, { count: number; type: string }> = {};
    entries.forEach((entry) => {
      if (entry.product_name) {
        if (!counts[entry.product_name]) {
          counts[entry.product_name] = { count: 0, type: entry.procedure_type };
        }
        counts[entry.product_name].count++;
      }
    });

    const data = Object.entries(counts)
      .map(([product, info]) => ({
        product,
        procedureType: info.type,
        count: info.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10

    return {
      data,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }
}
