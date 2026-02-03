import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET', '');
    this.publicUrl = this.configService.get<string>('S3_PUBLIC_URL', '');

    if (this.bucket) {
      const region = this.configService.get<string>('S3_REGION', 'auto');
      const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
      const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY', '');
      const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY', '');

      this.s3Client = new S3Client({
        region,
        ...(endpoint ? { endpoint } : {}),
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });

      this.logger.log(`S3 storage enabled — bucket: ${this.bucket}`);
    } else {
      this.logger.log('S3 not configured — using local disk storage');
    }
  }

  isS3Enabled(): boolean {
    return !!this.s3Client;
  }

  /**
   * Upload a file. Returns the URL (S3 public URL or local /uploads/... path).
   */
  async upload(
    file: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    if (this.s3Client) {
      return this.uploadToS3(file, key, contentType);
    }
    return this.uploadToDisk(file, key);
  }

  /**
   * Get the public URL for a stored file key.
   */
  getUrl(key: string): string {
    if (this.s3Client && this.publicUrl) {
      const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
      return `${this.publicUrl}/${normalizedKey}`;
    }
    // Local path
    const normalizedKey = key.startsWith('/') ? key : `/${key}`;
    return `/uploads${normalizedKey}`;
  }

  /**
   * Delete a file by key.
   */
  async delete(key: string): Promise<void> {
    if (this.s3Client) {
      await this.deleteFromS3(key);
    } else {
      this.deleteFromDisk(key);
    }
  }

  private async uploadToS3(
    file: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    const normalizedKey = key.startsWith('/') ? key.slice(1) : key;

    await this.s3Client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
        Body: file,
        ContentType: contentType,
      }),
    );

    const url = this.publicUrl
      ? `${this.publicUrl}/${normalizedKey}`
      : `https://${this.bucket}.s3.amazonaws.com/${normalizedKey}`;

    this.logger.log(`Uploaded to S3: ${normalizedKey}`);
    return url;
  }

  private async uploadToDisk(file: Buffer, key: string): Promise<string> {
    const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
    const filePath = path.join(process.cwd(), 'uploads', normalizedKey);
    const dir = path.dirname(filePath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, file);

    this.logger.log(`Uploaded to disk: ${normalizedKey}`);
    return `/uploads/${normalizedKey}`;
  }

  private async deleteFromS3(key: string): Promise<void> {
    const normalizedKey = key.startsWith('/') ? key.slice(1) : key;

    await this.s3Client!.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
      }),
    );

    this.logger.log(`Deleted from S3: ${normalizedKey}`);
  }

  private deleteFromDisk(key: string): void {
    const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
    const filePath = path.join(process.cwd(), 'uploads', normalizedKey);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`Deleted from disk: ${normalizedKey}`);
    }
  }
}
