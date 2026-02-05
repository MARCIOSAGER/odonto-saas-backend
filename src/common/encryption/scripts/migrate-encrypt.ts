/**
 * Migration script: Encrypts existing plaintext data in the database.
 *
 * Usage:
 *   npx ts-node src/common/encryption/scripts/migrate-encrypt.ts
 *
 * Requirements:
 *   - ENCRYPTION_KEY must be set in .env
 *   - DATABASE_URL must be set in .env
 *
 * This script is idempotent — it skips already-encrypted values (enc:v1: prefix).
 * Safe to run multiple times.
 */

import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption.service';
import { ENCRYPTED_FIELDS, EncryptedFieldConfig } from '../encryption.config';

// Bootstrap minimal config
const configService = {
  get: (key: string) => {
    if (key === 'ENCRYPTION_KEY') return process.env.ENCRYPTION_KEY;
    return undefined;
  },
} as ConfigService;

const encryption = new EncryptionService(configService);
const prisma = new PrismaClient();

const BATCH_SIZE = 100;

async function migrateModel(modelName: string, fields: EncryptedFieldConfig[]) {
  const model = (prisma as any)[modelName.charAt(0).toLowerCase() + modelName.slice(1)];
  if (!model || typeof model.findMany !== 'function') {
    console.log(`  ⏭ Model ${modelName} not found in Prisma client, skipping`);
    return;
  }

  let processed = 0;
  let encrypted = 0;
  let skip = 0;

  while (true) {
    const records = await model.findMany({
      take: BATCH_SIZE,
      skip,
    });

    if (records.length === 0) break;

    for (const record of records) {
      const updates: Record<string, unknown> = {};
      let needsUpdate = false;

      for (const fieldConfig of fields) {
        const value = record[fieldConfig.field];
        if (value === null || value === undefined) continue;

        // Skip already encrypted values
        if (typeof value === 'string' && encryption.isEncrypted(value)) continue;

        // Encrypt based on type
        if (fieldConfig.type === 'string') {
          if (typeof value === 'string' && value.length > 0) {
            updates[fieldConfig.field] = encryption.encrypt(value);
            needsUpdate = true;
          }
        } else if (fieldConfig.type === 'json' || fieldConfig.type === 'string[]') {
          updates[fieldConfig.field] = encryption.encryptJson(value);
          needsUpdate = true;
        }

        // Generate blind index if configured
        if (fieldConfig.blindIndex && value) {
          let normalized: string;
          if (fieldConfig.hashNormalize === 'lowercase') {
            normalized = String(value).trim().toLowerCase();
          } else {
            normalized = String(value).replace(/\D/g, '');
          }
          if (normalized.length > 0) {
            updates[fieldConfig.blindIndex] = encryption.hmac(normalized);
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        await model.update({
          where: { id: record.id },
          data: updates,
        });
        encrypted++;
      }
      processed++;
    }

    skip += BATCH_SIZE;
    process.stdout.write(
      `  ${modelName}: ${processed} records processed, ${encrypted} encrypted\r`,
    );
  }

  console.log(`  ✅ ${modelName}: ${processed} records processed, ${encrypted} encrypted`);
}

async function main() {
  console.log('🔐 LGPD Encryption Migration');
  console.log('============================\n');

  if (!encryption.isEnabled) {
    console.error('❌ ENCRYPTION_KEY not set. Set it in .env and try again.');
    process.exit(1);
  }

  console.log('✅ Encryption key loaded\n');

  for (const config of ENCRYPTED_FIELDS) {
    console.log(`📦 Migrating: ${config.model}`);
    try {
      await migrateModel(config.model, config.fields);
    } catch (error) {
      console.error(`  ❌ Error migrating ${config.model}:`, error);
    }
  }

  console.log('\n🎉 Migration complete!');
  await prisma.$disconnect();
}

// Load .env
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
