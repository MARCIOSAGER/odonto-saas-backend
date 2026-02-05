import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PdfGeneratorService } from '../../prescriptions/pdf-generator.service';
import { PdfJobData } from '../queue.service';
import { QUEUE_PDF } from '../queue.constants';

@Processor(QUEUE_PDF)
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(private readonly pdfGenerator: PdfGeneratorService) {
    super();
  }

  async process(job: Job<PdfJobData>): Promise<string> {
    const { prescriptionId, clinicId } = job.data;
    this.logger.log(`Processing PDF job ${job.id}: prescription=${prescriptionId}`);

    const url = await this.pdfGenerator.generatePdf(prescriptionId, clinicId);
    this.logger.log(`PDF generated: ${url}`);
    return url;
  }
}
