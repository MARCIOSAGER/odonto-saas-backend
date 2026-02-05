import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPdfService } from './report-pdf.service';
import { RedisCacheService } from '../cache/cache.service';

const TEN_MINUTES = 10 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportPdfService: ReportPdfService,
    private readonly cacheService: RedisCacheService,
  ) {}

  /**
   * Revenue report (by period, dentist, service) — SQL aggregation
   */
  async getRevenue(clinicId: string, startDate: Date, endDate: Date) {
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];

    return this.cacheService.getOrSet(
      `reports:revenue:${clinicId}:${startKey}:${endKey}`,
      async () => {
        const [totals, byDentist, byService, byMonth] = await Promise.all([
          this.prisma.$queryRaw<{ total_revenue: number; total_appointments: number }[]>`
            SELECT COALESCE(SUM(s.price), 0)::float as total_revenue,
                   COUNT(*)::int as total_appointments
            FROM "Appointment" a
            JOIN "Service" s ON a.service_id = s.id
            WHERE a.clinic_id = ${clinicId} AND a.status = 'completed'
              AND a.date >= ${startDate} AND a.date <= ${endDate}
          `,
          this.prisma.$queryRaw<{ name: string; revenue: number; count: number }[]>`
            SELECT COALESCE(d.name, 'Sem dentista') as name,
                   COALESCE(SUM(s.price), 0)::float as revenue,
                   COUNT(*)::int as count
            FROM "Appointment" a
            JOIN "Service" s ON a.service_id = s.id
            LEFT JOIN "Dentist" d ON a.dentist_id = d.id
            WHERE a.clinic_id = ${clinicId} AND a.status = 'completed'
              AND a.date >= ${startDate} AND a.date <= ${endDate}
            GROUP BY d.id, d.name ORDER BY revenue DESC
          `,
          this.prisma.$queryRaw<{ name: string; revenue: number; count: number }[]>`
            SELECT s.name,
                   COALESCE(SUM(s.price), 0)::float as revenue,
                   COUNT(*)::int as count
            FROM "Appointment" a
            JOIN "Service" s ON a.service_id = s.id
            WHERE a.clinic_id = ${clinicId} AND a.status = 'completed'
              AND a.date >= ${startDate} AND a.date <= ${endDate}
            GROUP BY s.name ORDER BY revenue DESC
          `,
          this.prisma.$queryRaw<{ month: string; revenue: number }[]>`
            SELECT TO_CHAR(a.date, 'YYYY-MM') as month,
                   COALESCE(SUM(s.price), 0)::float as revenue
            FROM "Appointment" a
            JOIN "Service" s ON a.service_id = s.id
            WHERE a.clinic_id = ${clinicId} AND a.status = 'completed'
              AND a.date >= ${startDate} AND a.date <= ${endDate}
            GROUP BY TO_CHAR(a.date, 'YYYY-MM') ORDER BY month
          `,
        ]);

        const { total_revenue, total_appointments } = totals[0] || {
          total_revenue: 0,
          total_appointments: 0,
        };

        return {
          total_revenue,
          total_appointments,
          average_ticket:
            total_appointments > 0 ? Math.round(total_revenue / total_appointments) : 0,
          by_dentist: byDentist,
          by_service: byService,
          by_month: byMonth,
        };
      },
      TEN_MINUTES,
    );
  }

  /**
   * Appointments report (attendance, no-shows, cancellations) — SQL aggregation
   */
  async getAppointments(clinicId: string, startDate: Date, endDate: Date) {
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];

    return this.cacheService.getOrSet(
      `reports:appointments:${clinicId}:${startKey}:${endKey}`,
      async () => {
        const [statusRows, monthRows] = await Promise.all([
          this.prisma.$queryRaw<{ status: string; count: number }[]>`
            SELECT status, COUNT(*)::int as count
            FROM "Appointment"
            WHERE clinic_id = ${clinicId}
              AND date >= ${startDate} AND date <= ${endDate}
            GROUP BY status
          `,
          this.prisma.$queryRaw<{ month: string; status: string; count: number }[]>`
            SELECT TO_CHAR(date, 'YYYY-MM') as month, status, COUNT(*)::int as count
            FROM "Appointment"
            WHERE clinic_id = ${clinicId}
              AND date >= ${startDate} AND date <= ${endDate}
            GROUP BY TO_CHAR(date, 'YYYY-MM'), status
            ORDER BY month
          `,
        ]);

        const statusCounts: Record<string, number> = {};
        for (const row of statusRows) {
          statusCounts[row.status] = row.count;
        }

        const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
        const completed = statusCounts['completed'] || 0;
        const cancelled = statusCounts['cancelled'] || 0;
        const noShow = statusCounts['no_show'] || 0;

        // Group month rows by month
        const monthMap = new Map<string, Record<string, number>>();
        for (const row of monthRows) {
          if (!monthMap.has(row.month)) monthMap.set(row.month, {});
          monthMap.get(row.month)![row.status] = row.count;
        }

        return {
          total,
          completed,
          cancelled,
          no_show: noShow,
          scheduled: statusCounts['scheduled'] || 0,
          confirmed: statusCounts['confirmed'] || 0,
          attendance_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
          cancellation_rate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
          no_show_rate: total > 0 ? Math.round((noShow / total) * 100) : 0,
          by_month: Array.from(monthMap.entries())
            .map(([month, statuses]) => ({ month, ...statuses }))
            .sort((a, b) => a.month.localeCompare(b.month)),
        };
      },
      TEN_MINUTES,
    );
  }

  /**
   * Patients report (new, active, inactive)
   */
  async getPatients(clinicId: string, startDate: Date, endDate: Date) {
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];

    return this.cacheService.getOrSet(
      `reports:patients:${clinicId}:${startKey}:${endKey}`,
      async () => {
        const [totalActive, totalInactive, newPatients] = await Promise.all([
          this.prisma.patient.count({
            where: { clinic_id: clinicId, status: 'active' },
          }),
          this.prisma.patient.count({
            where: { clinic_id: clinicId, status: 'inactive' },
          }),
          this.prisma.patient.findMany({
            where: {
              clinic_id: clinicId,
              created_at: { gte: startDate, lte: endDate },
            },
            select: { created_at: true },
          }),
        ]);

        // New patients by month
        const byMonth = new Map<string, number>();
        for (const p of newPatients) {
          const monthKey = `${p.created_at.getFullYear()}-${String(p.created_at.getMonth() + 1).padStart(2, '0')}`;
          byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + 1);
        }

        return {
          total_active: totalActive,
          total_inactive: totalInactive,
          new_in_period: newPatients.length,
          by_month: Array.from(byMonth.entries())
            .map(([month, count]) => ({ month, new_patients: count }))
            .sort((a, b) => a.month.localeCompare(b.month)),
        };
      },
      TEN_MINUTES,
    );
  }

  /**
   * Services report (most popular, avg ticket)
   */
  async getServices(clinicId: string, startDate: Date, endDate: Date) {
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];

    return this.cacheService.getOrSet(
      `reports:services:${clinicId}:${startKey}:${endKey}`,
      async () => {
        // SQL aggregation for service performance
        const services = await this.prisma.$queryRaw<
          Array<{
            name: string;
            count: bigint;
            revenue: number;
            duration: number;
          }>
        >`
          SELECT
            s.name,
            COUNT(*) as count,
            COALESCE(SUM(s.price), 0) as revenue,
            COALESCE(MAX(s.duration), 0) as duration
          FROM "Appointment" a
          JOIN "Service" s ON a.service_id = s.id
          WHERE a.clinic_id = ${clinicId}
            AND a.status = 'completed'
            AND a.date >= ${startDate}
            AND a.date <= ${endDate}
          GROUP BY s.name
          ORDER BY count DESC
        `;

        const total_services_performed = services.reduce((sum, s) => sum + Number(s.count), 0);

        return {
          total_services_performed,
          services: services.map((s) => ({
            name: s.name,
            count: Number(s.count),
            revenue: Number(s.revenue),
            duration: Number(s.duration),
            average_ticket:
              Number(s.count) > 0 ? Math.round(Number(s.revenue) / Number(s.count)) : 0,
          })),
        };
      },
      TEN_MINUTES,
    );
  }

  /**
   * Commissions report (by dentist)
   */
  async getCommissions(clinicId: string, startDate: Date, endDate: Date) {
    const startKey = startDate.toISOString().split('T')[0];
    const endKey = endDate.toISOString().split('T')[0];

    return this.cacheService.getOrSet(
      `reports:commissions:${clinicId}:${startKey}:${endKey}`,
      async () => {
        // SQL aggregation for dentist commissions
        const dentists = await this.prisma.$queryRaw<
          Array<{
            name: string;
            specialty: string | null;
            commission_rate: number;
            total_revenue: number;
            appointment_count: bigint;
          }>
        >`
          SELECT
            d.name,
            d.specialty,
            COALESCE(d.commission_rate, 0) as commission_rate,
            COALESCE(SUM(s.price), 0) as total_revenue,
            COUNT(*) as appointment_count
          FROM "Appointment" a
          JOIN "Dentist" d ON a.dentist_id = d.id
          JOIN "Service" s ON a.service_id = s.id
          WHERE a.clinic_id = ${clinicId}
            AND a.status = 'completed'
            AND a.date >= ${startDate}
            AND a.date <= ${endDate}
          GROUP BY d.id, d.name, d.specialty, d.commission_rate
          ORDER BY total_revenue DESC
        `;

        return {
          dentists: dentists.map((d) => ({
            name: d.name,
            specialty: d.specialty,
            commission_rate: Number(d.commission_rate),
            total_revenue: Number(d.total_revenue),
            total_commission: Number(d.total_revenue) * (Number(d.commission_rate) / 100),
            appointment_count: Number(d.appointment_count),
          })),
        };
      },
      TEN_MINUTES,
    );
  }

  /**
   * Cashflow projection (30/60/90 days) — SQL aggregation
   */
  async getCashflow(clinicId: string) {
    return this.cacheService.getOrSet(
      `reports:cashflow:${clinicId}`,
      async () => {
        const now = new Date();
        const days30 = new Date(now);
        days30.setDate(days30.getDate() + 30);
        const days60 = new Date(now);
        days60.setDate(days60.getDate() + 60);
        const days90 = new Date(now);
        days90.setDate(days90.getDate() + 90);

        type Projection = { appointments: number; revenue: number }[];

        const [p30, p60, p90] = await Promise.all([
          this.prisma.$queryRaw<Projection>`
            SELECT COUNT(*)::int as appointments, COALESCE(SUM(s.price), 0)::float as revenue
            FROM "Appointment" a JOIN "Service" s ON a.service_id = s.id
            WHERE a.clinic_id = ${clinicId} AND a.status IN ('scheduled', 'confirmed')
              AND a.date >= ${now} AND a.date <= ${days30}
          `,
          this.prisma.$queryRaw<Projection>`
            SELECT COUNT(*)::int as appointments, COALESCE(SUM(s.price), 0)::float as revenue
            FROM "Appointment" a JOIN "Service" s ON a.service_id = s.id
            WHERE a.clinic_id = ${clinicId} AND a.status IN ('scheduled', 'confirmed')
              AND a.date > ${days30} AND a.date <= ${days60}
          `,
          this.prisma.$queryRaw<Projection>`
            SELECT COUNT(*)::int as appointments, COALESCE(SUM(s.price), 0)::float as revenue
            FROM "Appointment" a JOIN "Service" s ON a.service_id = s.id
            WHERE a.clinic_id = ${clinicId} AND a.status IN ('scheduled', 'confirmed')
              AND a.date > ${days60} AND a.date <= ${days90}
          `,
        ]);

        const r30 = p30[0] || { appointments: 0, revenue: 0 };
        const r60 = p60[0] || { appointments: 0, revenue: 0 };
        const r90 = p90[0] || { appointments: 0, revenue: 0 };

        return {
          projection_30d: r30,
          projection_60d: r60,
          projection_90d: r90,
          total_projected: {
            appointments: r30.appointments + r60.appointments + r90.appointments,
            revenue: r30.revenue + r60.revenue + r90.revenue,
          },
        };
      },
      FIVE_MINUTES,
    );
  }

  /**
   * Export data as CSV string
   */
  async exportCsv(clinicId: string, type: string, startDate: Date, endDate: Date): Promise<string> {
    if (type === 'revenue') {
      const data = await this.getRevenue(clinicId, startDate, endDate);
      let csv = 'Dentista,Receita,Atendimentos\n';
      for (const d of data.by_dentist) {
        csv += `"${d.name}",${d.revenue},${d.count}\n`;
      }
      return csv;
    }

    if (type === 'appointments') {
      const appointments = await this.prisma.appointment.findMany({
        where: {
          clinic_id: clinicId,
          date: { gte: startDate, lte: endDate },
        },
        include: {
          patient: { select: { name: true } },
          dentist: { select: { name: true } },
          service: { select: { name: true, price: true } },
        },
        orderBy: { date: 'asc' },
      });

      let csv = 'Data,Hora,Paciente,Dentista,Serviço,Valor,Status\n';
      for (const a of appointments) {
        csv += `${a.date.toISOString().split('T')[0]},${a.time},"${a.patient.name}","${a.dentist?.name || '-'}","${a.service.name}",${a.service.price || 0},${a.status}\n`;
      }
      return csv;
    }

    if (type === 'patients') {
      const patients = await this.prisma.patient.findMany({
        where: {
          clinic_id: clinicId,
          created_at: { gte: startDate, lte: endDate },
        },
        select: { name: true, phone: true, email: true, cpf: true, created_at: true, status: true },
        orderBy: { created_at: 'desc' },
      });

      let csv = 'Nome,Telefone,Email,CPF,Data Cadastro,Status\n';
      for (const p of patients) {
        csv += `"${p.name}","${p.phone || ''}","${p.email || ''}","${p.cpf || ''}",${p.created_at.toISOString().split('T')[0]},${p.status}\n`;
      }
      return csv;
    }

    if (type === 'commissions') {
      const data = await this.getCommissions(clinicId, startDate, endDate);
      let csv =
        'Dentista,Especialidade,Taxa Comissão (%),Receita Total,Comissão Total,Atendimentos\n';
      for (const d of data.dentists) {
        csv += `"${d.name}","${d.specialty || '-'}",${d.commission_rate},${d.total_revenue.toFixed(2)},${d.total_commission.toFixed(2)},${d.appointment_count}\n`;
      }
      return csv;
    }

    return '';
  }

  /**
   * Export report as PDF buffer
   */
  async exportPdf(clinicId: string, type: string, startDate: Date, endDate: Date): Promise<Buffer> {
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
    const fmtCur = (v: number) => `R$ ${v.toFixed(2)}`;
    const period = `${fmt(startDate)} a ${fmt(endDate)}`;

    if (type === 'revenue') {
      const data = await this.getRevenue(clinicId, startDate, endDate);
      return this.reportPdfService.generatePdf(clinicId, {
        title: 'Relatório de Receita',
        period,
        clinicName: '',
        primaryColor: '',
        summary: [
          { label: 'Receita Total', value: fmtCur(data.total_revenue) },
          { label: 'Atendimentos', value: String(data.total_appointments) },
          { label: 'Ticket Médio', value: fmtCur(data.average_ticket) },
        ],
        headers: ['Dentista', 'Receita', 'Atendimentos'],
        rows: data.by_dentist.map((d) => [d.name, fmtCur(d.revenue), String(d.count)]),
      });
    }

    if (type === 'appointments') {
      const data = await this.getAppointments(clinicId, startDate, endDate);
      return this.reportPdfService.generatePdf(clinicId, {
        title: 'Relatório de Agendamentos',
        period,
        clinicName: '',
        primaryColor: '',
        summary: [
          { label: 'Total', value: String(data.total) },
          { label: 'Concluídos', value: String(data.completed) },
          { label: 'Taxa Presença', value: `${data.attendance_rate}%` },
          { label: 'Cancelamentos', value: String(data.cancelled) },
        ],
        headers: ['Mês', 'Agendados', 'Concluídos', 'Cancelados', 'Faltou'],
        rows: data.by_month.map((m: any) => [
          m.month,
          String(
            (m.scheduled || 0) +
              (m.confirmed || 0) +
              (m.completed || 0) +
              (m.cancelled || 0) +
              (m.no_show || 0),
          ),
          String(m.completed || 0),
          String(m.cancelled || 0),
          String(m.no_show || 0),
        ]),
      });
    }

    if (type === 'patients') {
      const data = await this.getPatients(clinicId, startDate, endDate);
      return this.reportPdfService.generatePdf(clinicId, {
        title: 'Relatório de Pacientes',
        period,
        clinicName: '',
        primaryColor: '',
        summary: [
          { label: 'Ativos', value: String(data.total_active) },
          { label: 'Inativos', value: String(data.total_inactive) },
          { label: 'Novos no Período', value: String(data.new_in_period) },
        ],
        headers: ['Mês', 'Novos Pacientes'],
        rows: data.by_month.map((m) => [m.month, String(m.new_patients)]),
      });
    }

    if (type === 'commissions') {
      const data = await this.getCommissions(clinicId, startDate, endDate);
      return this.reportPdfService.generatePdf(clinicId, {
        title: 'Relatório de Comissões',
        period,
        clinicName: '',
        primaryColor: '',
        headers: ['Dentista', 'Especialidade', 'Taxa (%)', 'Receita', 'Comissão', 'Atend.'],
        rows: data.dentists.map((d) => [
          d.name,
          d.specialty || '-',
          String(d.commission_rate),
          fmtCur(d.total_revenue),
          fmtCur(d.total_commission),
          String(d.appointment_count),
        ]),
      });
    }

    if (type === 'services') {
      const data = await this.getServices(clinicId, startDate, endDate);
      return this.reportPdfService.generatePdf(clinicId, {
        title: 'Relatório de Serviços',
        period,
        clinicName: '',
        primaryColor: '',
        summary: [{ label: 'Total Realizados', value: String(data.total_services_performed) }],
        headers: ['Serviço', 'Quantidade', 'Receita', 'Ticket Médio', 'Duração (min)'],
        rows: data.services.map((s) => [
          s.name,
          String(s.count),
          fmtCur(s.revenue),
          fmtCur(s.average_ticket),
          String(s.duration),
        ]),
      });
    }

    return Buffer.from('');
  }
}
