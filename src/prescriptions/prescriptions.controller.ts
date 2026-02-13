import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('prescriptions')
@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create prescription/certificate/referral' })
  @ApiResponse({ status: 201, description: 'Prescription created' })
  async create(@CurrentUser() user: { clinicId: string }, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptionsService.create(user.clinicId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all prescriptions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @CurrentUser() user: { clinicId: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prescriptionsService.findAll(
      user.clinicId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List prescriptions for a patient' })
  async findByPatient(
    @CurrentUser() user: { clinicId: string },
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.prescriptionsService.findByPatient(user.clinicId, patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get prescription by ID' })
  async findById(
    @CurrentUser() user: { clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prescriptionsService.findById(user.clinicId, id);
  }

  @Post(':id/generate-pdf')
  @ApiOperation({ summary: 'Generate or regenerate PDF for prescription' })
  async generatePdf(
    @CurrentUser() user: { clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const pdfUrl = await this.prescriptionsService.generatePdf(user.clinicId, id);
    return { pdf_url: pdfUrl };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download prescription PDF' })
  async downloadPdf(
    @CurrentUser() user: { clinicId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    let prescription = await this.prescriptionsService.findById(user.clinicId, id);

    if (!prescription.pdf_url) {
      await this.prescriptionsService.generatePdf(user.clinicId, id);
      prescription = await this.prescriptionsService.findById(user.clinicId, id);
    }

    const pdfUrl = prescription.pdf_url || '';

    // S3/R2 URLs — redirect only to trusted domains
    if (pdfUrl.startsWith('https://')) {
      try {
        const urlObj = new URL(pdfUrl);
        const trustedPatterns = ['.s3.amazonaws.com', '.r2.cloudflarestorage.com', '.r2.dev'];
        const isTrusted = trustedPatterns.some((p) => urlObj.hostname.endsWith(p));
        if (!isTrusted) {
          throw new NotFoundException('URL de PDF inválida');
        }
      } catch (e) {
        if (e instanceof NotFoundException) throw e;
        throw new NotFoundException('URL de PDF inválida');
      }
      return res.redirect(302, pdfUrl);
    }

    // Local file — validate path to prevent traversal
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const filePath = path.resolve(process.cwd(), pdfUrl);
    if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
      throw new NotFoundException('Arquivo PDF não encontrado');
    }

    const types: Record<string, string> = {
      prescription: 'receita',
      certificate: 'atestado',
      referral: 'encaminhamento',
    };
    const typeName = types[prescription.type] || 'documento';
    const patientName = (prescription.patient?.name || 'paciente')
      .replace(/\s+/g, '_')
      .toLowerCase();
    const fileName = `${typeName}_${patientName}_${id.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Mark prescription as sent' })
  async markAsSent(@Param('id', ParseUUIDPipe) id: string, @Body() body: { via: string }) {
    return this.prescriptionsService.markAsSent(id, body.via);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete prescription' })
  async delete(@CurrentUser() user: { clinicId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.prescriptionsService.delete(user.clinicId, id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted prescription' })
  @ApiResponse({ status: 200, description: 'Prescription restored' })
  async restore(@CurrentUser() user: { clinicId: string }, @Param('id', ParseUUIDPipe) id: string) {
    return this.prescriptionsService.restore(user.clinicId, id);
  }
}
