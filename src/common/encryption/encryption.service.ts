import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  private readonly hmacKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const keyHex = this.configService.get<string>('ENCRYPTION_KEY');
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    if (!keyHex || keyHex.length !== 64) {
      if (nodeEnv === 'production') {
        throw new Error(
          'FATAL: ENCRYPTION_KEY must be set (64 hex chars) in production. ' +
            "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        );
      }
      this.logger.warn(
        'ENCRYPTION_KEY not set or invalid (must be 64 hex chars). Encryption disabled.',
      );
      this.key = Buffer.alloc(32);
      this.hmacKey = Buffer.alloc(32);
      return;
    }

    this.key = Buffer.from(keyHex, 'hex');
    this.hmacKey = crypto.createHash('sha256').update(this.key).update('hmac-key').digest();
  }

  get isEnabled(): boolean {
    return !this.key.equals(Buffer.alloc(32));
  }

  isEncrypted(value: string): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  encrypt(plaintext: string): string {
    if (!this.isEnabled || !plaintext) return plaintext;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    if (!this.isEnabled || !ciphertext) return ciphertext;
    if (!this.isEncrypted(ciphertext)) return ciphertext;

    try {
      const parts = ciphertext.slice(PREFIX.length).split(':');
      if (parts.length !== 3) return ciphertext;

      const [ivB64, authTagB64, encryptedB64] = parts;
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');
      const encrypted = Buffer.from(encryptedB64, 'base64');

      if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        return ciphertext;
      }

      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      return ciphertext;
    }
  }

  hmac(value: string): string {
    if (!this.isEnabled || !value) return value;
    return crypto.createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }

  encryptJson(value: unknown): string {
    if (!this.isEnabled || value === null || value === undefined) return value as string;
    return this.encrypt(JSON.stringify(value));
  }

  decryptJson(ciphertext: string): unknown {
    if (!this.isEnabled || !ciphertext) return ciphertext;
    if (!this.isEncrypted(ciphertext)) {
      try {
        return JSON.parse(ciphertext);
      } catch {
        return ciphertext;
      }
    }

    const decrypted = this.decrypt(ciphertext);
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }
}
