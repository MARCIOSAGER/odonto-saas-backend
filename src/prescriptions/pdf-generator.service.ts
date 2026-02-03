import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  notes?: string;
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(prescriptionId: string, clinicId: string): Promise<string> {
    const prescription = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, clinic_id: clinicId },
      include: {
        patient: {
          select: {
            name: true,
            cpf: true,
            birth_date: true,
            address: true,
            phone: true,
          },
        },
        dentist: {
          select: { name: true, cro: true, specialty: true },
        },
      },
    });

    if (!prescription) {
      throw new Error('Prescrição não encontrada');
    }

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        name: true,
        cnpj: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        primary_color: true,
      },
    });

    // Ensure directory exists
    const dir = path.join(process.cwd(), 'uploads', 'prescriptions', clinicId);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${prescriptionId}.pdf`);
    const pdfUrl = `/uploads/prescriptions/${clinicId}/${prescriptionId}.pdf`;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
      });

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const primaryColor = clinic?.primary_color || '#0EA5E9';

      // ---- HEADER ----
      doc
        .fillColor(primaryColor)
        .rect(0, 0, doc.page.width, 3)
        .fill();

      doc.moveDown(0.5);

      // Clinic name
      doc
        .fontSize(18)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text(clinic?.name || 'Clínica', { align: 'center' });

      // Clinic details
      const clinicDetails: string[] = [];
      if (clinic?.address) {
        let addr = clinic.address;
        if (clinic.city) addr += ` - ${clinic.city}`;
        if (clinic.state) addr += `/${clinic.state}`;
        clinicDetails.push(addr);
      }
      if (clinic?.phone) clinicDetails.push(`Tel: ${clinic.phone}`);
      if (clinic?.cnpj) {
        const label = clinic.cnpj.length <= 11 ? 'CPF' : 'CNPJ';
        clinicDetails.push(`${label}: ${clinic.cnpj}`);
      }

      if (clinicDetails.length > 0) {
        doc
          .fontSize(9)
          .fillColor('#666666')
          .font('Helvetica')
          .text(clinicDetails.join('  |  '), { align: 'center' });
      }

      doc.moveDown(0.5);

      // Separator line
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(1)
        .moveTo(60, doc.y)
        .lineTo(doc.page.width - 60, doc.y)
        .stroke();

      doc.moveDown(1);

      // ---- DOCUMENT TITLE ----
      const titles: Record<string, string> = {
        prescription: 'RECEITUÁRIO',
        certificate: 'ATESTADO',
        referral: 'ENCAMINHAMENTO',
      };

      doc
        .fontSize(16)
        .fillColor('#1f2937')
        .font('Helvetica-Bold')
        .text(titles[prescription.type] || 'DOCUMENTO', { align: 'center' });

      doc.moveDown(1);

      // ---- PATIENT INFO ----
      doc
        .fontSize(10)
        .fillColor(primaryColor)
        .font('Helvetica-Bold')
        .text('PACIENTE');

      doc
        .strokeColor(primaryColor)
        .lineWidth(0.5)
        .moveTo(60, doc.y + 2)
        .lineTo(200, doc.y + 2)
        .stroke();

      doc.moveDown(0.3);

      doc.fontSize(10).fillColor('#374151').font('Helvetica');

      const patient = prescription.patient;
      doc.text(`Nome: ${patient.name}`);
      if (patient.cpf) doc.text(`CPF: ${patient.cpf}`);
      if (patient.birth_date) {
        const bd = new Date(patient.birth_date);
        doc.text(`Data de nascimento: ${bd.toLocaleDateString('pt-BR')}`);
      }
      if (patient.address) doc.text(`Endereço: ${patient.address}`);

      doc.moveDown(1);

      // ---- CONTENT ----
      const content = prescription.content as Record<string, any>;

      if (prescription.type === 'prescription' && content?.medications) {
        doc
          .fontSize(10)
          .fillColor(primaryColor)
          .font('Helvetica-Bold')
          .text('MEDICAMENTOS');

        doc
          .strokeColor(primaryColor)
          .lineWidth(0.5)
          .moveTo(60, doc.y + 2)
          .lineTo(250, doc.y + 2)
          .stroke();

        doc.moveDown(0.5);

        const medications: Medication[] = content.medications;
        medications.forEach((med, index) => {
          doc
            .fontSize(11)
            .fillColor('#1f2937')
            .font('Helvetica-Bold')
            .text(`${index + 1}. ${med.name}`);

          const details: string[] = [];
          if (med.dosage) details.push(`Posologia: ${med.dosage}`);
          if (med.frequency) details.push(`Frequência: ${med.frequency}`);
          if (med.duration) details.push(`Duração: ${med.duration}`);

          if (details.length > 0) {
            doc
              .fontSize(9)
              .fillColor('#6b7280')
              .font('Helvetica')
              .text(`   ${details.join('  •  ')}`);
          }

          if (med.notes) {
            doc
              .fontSize(9)
              .fillColor('#6b7280')
              .font('Helvetica-Oblique')
              .text(`   Obs: ${med.notes}`);
          }

          doc.moveDown(0.5);
        });
      } else if (content?.text) {
        // Certificate or referral — free text
        doc
          .fontSize(10)
          .fillColor(primaryColor)
          .font('Helvetica-Bold')
          .text(
            prescription.type === 'certificate' ? 'DECLARAÇÃO' : 'DESCRIÇÃO',
          );

        doc
          .strokeColor(primaryColor)
          .lineWidth(0.5)
          .moveTo(60, doc.y + 2)
          .lineTo(220, doc.y + 2)
          .stroke();

        doc.moveDown(0.5);

        doc
          .fontSize(11)
          .fillColor('#374151')
          .font('Helvetica')
          .text(content.text, { lineGap: 4 });
      }

      // ---- FOOTER ----
      const footerY = doc.page.height - 150;
      doc.y = Math.max(doc.y + 40, footerY);

      // Separator
      doc
        .strokeColor('#e5e7eb')
        .lineWidth(1)
        .moveTo(60, doc.y)
        .lineTo(doc.page.width - 60, doc.y)
        .stroke();

      doc.moveDown(1);

      // Date
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      doc
        .fontSize(10)
        .fillColor('#374151')
        .font('Helvetica')
        .text(
          `${clinic?.city || 'Local'}, ${dateStr}`,
          { align: 'center' },
        );

      doc.moveDown(2);

      // Signature line
      const centerX = doc.page.width / 2;
      doc
        .strokeColor('#9ca3af')
        .lineWidth(0.5)
        .moveTo(centerX - 120, doc.y)
        .lineTo(centerX + 120, doc.y)
        .stroke();

      doc.moveDown(0.3);

      const dentist = prescription.dentist;
      doc
        .fontSize(10)
        .fillColor('#1f2937')
        .font('Helvetica-Bold')
        .text(`Dr(a). ${dentist.name}`, { align: 'center' });

      const dentistInfo: string[] = [];
      if (dentist.cro) dentistInfo.push(`CRO: ${dentist.cro}`);
      if (dentist.specialty) dentistInfo.push(dentist.specialty);

      if (dentistInfo.length > 0) {
        doc
          .fontSize(9)
          .fillColor('#6b7280')
          .font('Helvetica')
          .text(dentistInfo.join(' - '), { align: 'center' });
      }

      doc.end();

      stream.on('finish', async () => {
        // Update pdf_url in database
        await this.prisma.prescription.update({
          where: { id: prescriptionId },
          data: { pdf_url: pdfUrl },
        });

        this.logger.log(
          `PDF generated for prescription ${prescriptionId}: ${pdfUrl}`,
        );
        resolve(pdfUrl);
      });

      stream.on('error', (err) => {
        this.logger.error(`Failed to generate PDF: ${err.message}`);
        reject(err);
      });
    });
  }
}
