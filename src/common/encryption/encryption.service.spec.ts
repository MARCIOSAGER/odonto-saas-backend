import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import * as crypto from 'crypto';

describe('EncryptionService', () => {
  const TEST_KEY = crypto.randomBytes(32).toString('hex');

  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'ENCRYPTION_KEY' ? TEST_KEY : undefined),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  describe('isEnabled', () => {
    it('should be enabled with valid key', () => {
      expect(service.isEnabled).toBe(true);
    });

    it('should be disabled without key', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile();

      const disabledService = module.get<EncryptionService>(EncryptionService);
      expect(disabledService.isEnabled).toBe(false);
    });
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const plaintext = 'Dados sensíveis do paciente';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(service.isEncrypted(encrypted)).toBe(true);
      expect(encrypted.startsWith('enc:v1:')).toBe(true);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = '123.456.789-00';
      const enc1 = service.encrypt(plaintext);
      const enc2 = service.encrypt(plaintext);

      expect(enc1).not.toBe(enc2);
      expect(service.decrypt(enc1)).toBe(plaintext);
      expect(service.decrypt(enc2)).toBe(plaintext);
    });

    it('should return empty/null values as-is', () => {
      expect(service.encrypt('')).toBe('');
      expect(service.encrypt(null as unknown as string)).toBe(null);
      expect(service.decrypt('')).toBe('');
      expect(service.decrypt(null as unknown as string)).toBe(null);
    });

    it('should return non-encrypted strings as-is on decrypt', () => {
      expect(service.decrypt('plaintext value')).toBe('plaintext value');
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Alergia: Penicilina 💊 — Observação médica';
      const encrypted = service.encrypt(plaintext);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = service.encrypt(plaintext);
      expect(service.decrypt(encrypted)).toBe(plaintext);
    });
  });

  describe('hmac', () => {
    it('should produce deterministic hash', () => {
      const value = '11999999999';
      const hash1 = service.hmac(value);
      const hash2 = service.hmac(value);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different values', () => {
      const hash1 = service.hmac('123.456.789-00');
      const hash2 = service.hmac('987.654.321-00');

      expect(hash1).not.toBe(hash2);
    });

    it('should return empty values as-is', () => {
      expect(service.hmac('')).toBe('');
    });
  });

  describe('encryptJson / decryptJson', () => {
    it('should encrypt and decrypt an object', () => {
      const obj = { allergies: ['Penicilina', 'Dipirona'], severity: 'high' };
      const encrypted = service.encryptJson(obj);

      expect(typeof encrypted).toBe('string');
      expect(service.isEncrypted(encrypted)).toBe(true);

      const decrypted = service.decryptJson(encrypted);
      expect(decrypted).toEqual(obj);
    });

    it('should encrypt and decrypt an array', () => {
      const arr = ['Penicilina', 'Dipirona', 'Ibuprofeno'];
      const encrypted = service.encryptJson(arr);

      const decrypted = service.decryptJson(encrypted);
      expect(decrypted).toEqual(arr);
    });

    it('should handle null/undefined', () => {
      expect(service.encryptJson(null)).toBe(null);
      expect(service.encryptJson(undefined)).toBe(undefined);
    });

    it('should handle non-encrypted JSON strings (backwards compat)', () => {
      const jsonStr = '["aspirin","ibuprofen"]';
      const result = service.decryptJson(jsonStr);
      expect(result).toEqual(['aspirin', 'ibuprofen']);
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted values', () => {
      const encrypted = service.encrypt('test');
      expect(service.isEncrypted(encrypted)).toBe(true);
    });

    it('should not detect plain strings', () => {
      expect(service.isEncrypted('plain text')).toBe(false);
      expect(service.isEncrypted('')).toBe(false);
    });
  });

  describe('disabled mode', () => {
    let disabledService: EncryptionService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile();

      disabledService = module.get<EncryptionService>(EncryptionService);
    });

    it('should pass through values when disabled', () => {
      const value = 'sensitive data';
      expect(disabledService.encrypt(value)).toBe(value);
      expect(disabledService.decrypt(value)).toBe(value);
      expect(disabledService.hmac(value)).toBe(value);
    });
  });
});
