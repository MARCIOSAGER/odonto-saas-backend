import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

interface ReportData {
  title: string;
  period: string;
  clinicName: string;
  primaryColor: string;
  headers: string[];
  rows: string[][];
  summary?: { label: string; value: string }[];
}

@Injectable()
export class ReportPdfService {
  private readonly logger = new Logger(ReportPdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(clinicId: string, data: ReportData): Promise<Buffer> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, cnpj: true, primary_color: true },
    });

    const primaryColor = clinic?.primary_color || '#0EA5E9';
    const clinicName = data.clinicName || clinic?.name || 'Clínica';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
        bufferPages: true,
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: Error) => reject(err));

      const pageWidth = 495; // A4 minus margins

      // ── Header ──
      doc
        .rect(0, 0, 595, 70)
        .fill(primaryColor);

      doc
        .fillColor('#FFFFFF')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(data.title, 50, 20, { width: pageWidth });

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`${clinicName}  |  ${data.period}`, 50, 45, { width: pageWidth });

      doc.fillColor('#000000');
      doc.y = 85;

      // ── Summary cards ──
      if (data.summary && data.summary.length > 0) {
        const cardWidth = Math.floor(pageWidth / Math.min(data.summary.length, 4));
        let x = 50;

        for (const item of data.summary.slice(0, 4)) {
          doc
            .rect(x, doc.y, cardWidth - 8, 45)
            .lineWidth(0.5)
            .strokeColor('#E5E7EB')
            .stroke();

          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#6B7280')
            .text(item.label, x + 8, doc.y + 8, { width: cardWidth - 20 });

          doc
            .fontSize(14)
            .font('Helvetica-Bold')
            .fillColor(primaryColor)
            .text(item.value, x + 8, doc.y + 20, { width: cardWidth - 20 });

          x += cardWidth;
        }

        doc.y += 55;
        doc.fillColor('#000000');
      }

      // ── Table ──
      if (data.headers.length > 0 && data.rows.length > 0) {
        const colCount = data.headers.length;
        const colWidth = Math.floor(pageWidth / colCount);
        let y = doc.y + 5;

        // Table header
        doc
          .rect(50, y, pageWidth, 20)
          .fill('#F3F4F6');

        doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold');
        for (let i = 0; i < colCount; i++) {
          doc.text(data.headers[i], 50 + i * colWidth + 5, y + 5, {
            width: colWidth - 10,
            lineBreak: false,
          });
        }
        y += 22;

        // Table rows
        doc.font('Helvetica').fontSize(8).fillColor('#000000');
        for (const row of data.rows) {
          if (y > 760) {
            doc.addPage();
            y = 40;
          }

          // Zebra striping
          const rowIndex = data.rows.indexOf(row);
          if (rowIndex % 2 === 1) {
            doc.rect(50, y, pageWidth, 18).fill('#F9FAFB');
            doc.fillColor('#000000');
          }

          for (let i = 0; i < colCount; i++) {
            doc.text(row[i] || '-', 50 + i * colWidth + 5, y + 4, {
              width: colWidth - 10,
              lineBreak: false,
            });
          }
          y += 18;
        }

        // Row count
        doc.y = y + 10;
        doc
          .fontSize(7)
          .fillColor('#9CA3AF')
          .text(`Total: ${data.rows.length} registro(s)`, 50, doc.y, { width: pageWidth, align: 'right' });
      }

      // ── Footer ──
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(7)
          .fillColor('#9CA3AF')
          .text(
            `Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}  —  Página ${i + 1} de ${pages.count}`,
            50,
            790,
            { width: pageWidth, align: 'center' },
          );
      }

      doc.end();
    });
  }
}
