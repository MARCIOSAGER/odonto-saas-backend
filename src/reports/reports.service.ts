import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportPdfService } from './report-pdf.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportPdfService: ReportPdfService,
  ) {}

  /**
   * Revenue report (by period, dentist, service)
   */
  async getRevenue(clinicId: string, startDate: Date, endDate: Date) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        status: 'completed',
        date: { gte: startDate, lte: endDate },
      },
      include: {
        service: { select: { name: true, price: true } },
        dentist: { select: { id: true, name: true } },
      },
    });

    let totalRevenue = 0;
    const byDentist = new Map<string, { name: string; revenue: number; count: number }>();
    const byService = new Map<string, { name: string; revenue: number; count: number }>();
    const byMonth = new Map<string, number>();

    for (const apt of appointments) {
      const price = Number(apt.service.price || 0);
      totalRevenue += price;

      // By dentist
      if (apt.dentist) {
        const d = byDentist.get(apt.dentist.id) || { name: apt.dentist.name, revenue: 0, count: 0 };
        d.revenue += price;
        d.count++;
        byDentist.set(apt.dentist.id, d);
      }

      // By service
      const s = byService.get(apt.service.name) || { name: apt.service.name, revenue: 0, count: 0 };
      s.revenue += price;
      s.count++;
      byService.set(apt.service.name, s);

      // By month
      const monthKey = `${apt.date.getFullYear()}-${String(apt.date.getMonth() + 1).padStart(2, '0')}`;
      byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + price);
    }

    return {
      total_revenue: totalRevenue,
      total_appointments: appointments.length,
      average_ticket: appointments.length > 0 ? Math.round(totalRevenue / appointments.length) : 0,
      by_dentist: Array.from(byDentist.values()).sort((a, b) => b.revenue - a.revenue),
      by_service: Array.from(byService.values()).sort((a, b) => b.revenue - a.revenue),
      by_month: Array.from(byMonth.entries())
        .map(([month, revenue]) => ({ month, revenue }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  /**
   * Appointments report (attendance, no-shows, cancellations)
   */
  async getAppointments(clinicId: string, startDate: Date, endDate: Date) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        date: { gte: startDate, lte: endDate },
      },
      select: { status: true, date: true },
    });

    const statusCounts: Record<string, number> = {};
    const byMonth = new Map<string, Record<string, number>>();

    for (const apt of appointments) {
      statusCounts[apt.status] = (statusCounts[apt.status] || 0) + 1;

      const monthKey = `${apt.date.getFullYear()}-${String(apt.date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, {});
      const m = byMonth.get(monthKey)!;
      m[apt.status] = (m[apt.status] || 0) + 1;
    }

    const total = appointments.length;
    const completed = statusCounts['completed'] || 0;
    const cancelled = statusCounts['cancelled'] || 0;
    const noShow = statusCounts['no_show'] || 0;

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
      by_month: Array.from(byMonth.entries())
        .map(([month, statuses]) => ({ month, ...statuses }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  /**
   * Patients report (new, active, inactive)
   */
  async getPatients(clinicId: string, startDate: Date, endDate: Date) {
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
  }

  /**
   * Services report (most popular, avg ticket)
   */
  async getServices(clinicId: string, startDate: Date, endDate: Date) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        status: 'completed',
        date: { gte: startDate, lte: endDate },
      },
      include: {
        service: { select: { name: true, price: true, duration: true } },
      },
    });

    const serviceMap = new Map<string, { name: string; count: number; revenue: number; duration: number }>();

    for (const apt of appointments) {
      const key = apt.service.name;
      const s = serviceMap.get(key) || { name: key, count: 0, revenue: 0, duration: Number(apt.service.duration || 0) };
      s.count++;
      s.revenue += Number(apt.service.price || 0);
      serviceMap.set(key, s);
    }

    const services = Array.from(serviceMap.values())
      .map((s) => ({
        ...s,
        average_ticket: s.count > 0 ? Math.round(s.revenue / s.count) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total_services_performed: appointments.length,
      services,
    };
  }

  /**
   * Commissions report (by dentist)
   */
  async getCommissions(clinicId: string, startDate: Date, endDate: Date) {
    const appointments: any[] = await this.prisma.appointment.findMany({
      where: {
        clinic_id: clinicId,
        status: 'completed',
        date: { gte: startDate, lte: endDate },
      },
      include: {
        dentist: true,
        service: { select: { name: true, price: true } },
      },
    });

    const dentistMap = new Map<string, {
      name: string;
      specialty: string | null;
      commission_rate: number;
      total_revenue: number;
      total_commission: number;
      appointment_count: number;
    }>();

    for (const apt of appointments) {
      if (!apt.dentist) continue;
      const d = dentistMap.get(apt.dentist.id) || {
        name: apt.dentist.name,
        specialty: apt.dentist.specialty,
        commission_rate: Number(apt.dentist.commission_rate || 0),
        total_revenue: 0,
        total_commission: 0,
        appointment_count: 0,
      };
      const price = Number(apt.service.price || 0);
      d.total_revenue += price;
      d.total_commission += price * (d.commission_rate / 100);
      d.appointment_count++;
      dentistMap.set(apt.dentist.id, d);
    }

    return {
      dentists: Array.from(dentistMap.values()).sort((a, b) => b.total_revenue - a.total_revenue),
    };
  }

  /**
   * Cashflow projection (30/60/90 days)
   */
  async getCashflow(clinicId: string) {
    const now = new Date();
    const days30 = new Date(now);
    days30.setDate(days30.getDate() + 30);
    const days60 = new Date(now);
    days60.setDate(days60.getDate() + 60);
    const days90 = new Date(now);
    days90.setDate(days90.getDate() + 90);

    // Upcoming appointments as projected revenue
    const [next30, next60, next90] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          clinic_id: clinicId,
          status: { in: ['scheduled', 'confirmed'] },
          date: { gte: now, lte: days30 },
        },
        include: { service: { select: { price: true } } },
      }),
      this.prisma.appointment.findMany({
        where: {
          clinic_id: clinicId,
          status: { in: ['scheduled', 'confirmed'] },
          date: { gte: days30, lte: days60 },
        },
        include: { service: { select: { price: true } } },
      }),
      this.prisma.appointment.findMany({
        where: {
          clinic_id: clinicId,
          status: { in: ['scheduled', 'confirmed'] },
          date: { gte: days60, lte: days90 },
        },
        include: { service: { select: { price: true } } },
      }),
    ]);

    const sum = (apts: typeof next30) => apts.reduce((acc, a) => acc + Number(a.service.price || 0), 0);

    return {
      projection_30d: { appointments: next30.length, revenue: sum(next30) },
      projection_60d: { appointments: next60.length, revenue: sum(next60) },
      projection_90d: { appointments: next90.length, revenue: sum(next90) },
      total_projected: {
        appointments: next30.length + next60.length + next90.length,
        revenue: sum(next30) + sum(next60) + sum(next90),
      },
    };
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
      let csv = 'Dentista,Especialidade,Taxa Comissão (%),Receita Total,Comissão Total,Atendimentos\n';
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
          String((m.scheduled || 0) + (m.confirmed || 0) + (m.completed || 0) + (m.cancelled || 0) + (m.no_show || 0)),
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
        summary: [
          { label: 'Total Realizados', value: String(data.total_services_performed) },
        ],
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
