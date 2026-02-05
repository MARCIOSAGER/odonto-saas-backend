import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';

export interface EmitNfseParams {
  invoice_id: string;
  clinic_id: string;
  clinic_name: string;
  clinic_cnpj: string;
  amount: number;
  description: string;
}

@Injectable()
export class NfseService {
  private client: AxiosInstance | null = null;
  private readonly logger = new Logger(NfseService.name);
  private readonly provider: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.provider = this.configService.get<string>('NFSE_PROVIDER') || 'enotas';
    const apiKey = this.configService.get<string>('NFSE_API_KEY');

    if (apiKey) {
      const baseURL =
        this.provider === 'enotas' ? 'https://api.enotas.com.br/v2' : 'https://api.nfe.io/v1';

      this.client = axios.create({
        baseURL,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } else {
      this.logger.warn('NFSE_API_KEY not configured — NFS-e emission disabled');
    }
  }

  /**
   * Emit NFS-e for a paid invoice
   */
  async emit(params: EmitNfseParams): Promise<{ nfse_id: string; status: string }> {
    if (!this.client) {
      this.logger.warn('NFS-e provider not configured. Skipping emission.');
      return { nfse_id: '', status: 'disabled' };
    }

    try {
      // Update invoice status to pending emission
      await this.prisma.invoice.update({
        where: { id: params.invoice_id },
        data: { nfse_status: 'pending' },
      });

      let nfseId: string;

      if (this.provider === 'enotas') {
        nfseId = await this.emitViaEnotas(params);
      } else {
        nfseId = await this.emitViaNfeio(params);
      }

      await this.prisma.invoice.update({
        where: { id: params.invoice_id },
        data: {
          nfse_id: nfseId,
          nfse_status: 'issued',
        },
      });

      return { nfse_id: nfseId, status: 'issued' };
    } catch (error) {
      this.logger.error('Failed to emit NFS-e:', error);

      await this.prisma.invoice.update({
        where: { id: params.invoice_id },
        data: {
          nfse_status: 'error',
          nfse_cancel_reason: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return { nfse_id: '', status: 'error' };
    }
  }

  /**
   * Cancel a NFS-e
   */
  async cancel(invoiceId: string, reason: string): Promise<{ status: string }> {
    if (!this.client) {
      return { status: 'disabled' };
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice?.nfse_id) {
      return { status: 'not_found' };
    }

    try {
      if (this.provider === 'enotas') {
        await this.client.delete(`/empresas/${invoice.clinic_id}/nfes/${invoice.nfse_id}`);
      } else {
        await this.client.delete(
          `/companies/${invoice.clinic_id}/serviceinvoices/${invoice.nfse_id}`,
        );
      }

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          nfse_status: 'canceled',
          nfse_cancel_reason: reason,
        },
      });

      return { status: 'canceled' };
    } catch (error) {
      this.logger.error('Failed to cancel NFS-e:', error);
      return { status: 'error' };
    }
  }

  /**
   * Get NFS-e PDF URL
   */
  async getPdfUrl(invoiceId: string): Promise<string | null> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    return invoice?.nfse_pdf_url || null;
  }

  /**
   * Reprocess a failed NFS-e emission
   */
  async reprocess(invoiceId: string): Promise<{ status: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { clinic: true },
    });

    if (!invoice || !invoice.clinic) {
      return { status: 'not_found' };
    }

    const result = await this.emit({
      invoice_id: invoice.id,
      clinic_id: invoice.clinic_id,
      clinic_name: invoice.clinic.name,
      clinic_cnpj: invoice.clinic.cnpj,
      amount: Number(invoice.total),
      description: invoice.description || 'Serviço de gestão odontológica',
    });

    return { status: result.status };
  }

  private async emitViaEnotas(params: EmitNfseParams): Promise<string> {
    const { data } = await this.client!.post(`/empresas/${params.clinic_cnpj}/nfes`, {
      tipo: 'NFS-e',
      valorTotal: params.amount,
      servico: {
        descricao: params.description,
      },
    });
    return data.nfeId || data.id;
  }

  private async emitViaNfeio(params: EmitNfseParams): Promise<string> {
    const { data } = await this.client!.post(`/companies/${params.clinic_cnpj}/serviceinvoices`, {
      cityServiceCode: '1.05',
      description: params.description,
      servicesAmount: params.amount,
    });
    return data.id;
  }
}
