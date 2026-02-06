#!/usr/bin/env node
/**
 * Database initialization script for production
 * Handles baseline for existing databases that were managed with `prisma db push`
 *
 * This script:
 * 1. Checks if _prisma_migrations table exists
 * 2. If not, and database has tables, creates a baseline
 * 3. Runs prisma migrate deploy
 */

const { execSync } = require('child_process');

const INITIAL_MIGRATION = '20250206000000_init';

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
  } catch (error) {
    if (options.ignoreError) {
      return error.stdout || '';
    }
    throw error;
  }
}

async function main() {
  console.log('🔄 Starting database initialization...');

  try {
    // Try to run migrate deploy first
    console.log('🚀 Attempting to deploy migrations...');
    exec('npx prisma migrate deploy');
    console.log('✅ Database initialization complete!');
    process.exit(0);
  } catch (error) {
    const errorMessage = error.stderr || error.message || '';

    // Check if it's the P3005 error (database not empty)
    if (errorMessage.includes('P3005') || errorMessage.includes('not empty')) {
      console.log('📋 Existing schema detected. Creating baseline for initial migration...');

      try {
        // Mark the initial migration as already applied (baseline)
        exec(`npx prisma migrate resolve --applied ${INITIAL_MIGRATION}`);
        console.log('✅ Baseline created successfully');

        // Try migrate deploy again
        console.log('🚀 Deploying remaining migrations...');
        exec('npx prisma migrate deploy');
        console.log('✅ Database initialization complete!');
        process.exit(0);
      } catch (resolveError) {
        console.error('❌ Failed to create baseline:', resolveError.message);
        process.exit(1);
      }
    } else {
      console.error('❌ Migration failed:', errorMessage);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
