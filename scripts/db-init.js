#!/usr/bin/env node
/**
 * Database initialization script for production
 * Handles baseline for existing databases that were managed with `prisma db push`
 */

const { execSync, spawnSync } = require('child_process');

const INITIAL_MIGRATION = '20250206000000_init';

function runPrismaCommand(args) {
  console.log(`> npx prisma ${args}`);

  const result = spawnSync('npx', ['prisma', ...args.split(' ')], {
    encoding: 'utf-8',
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = stdout + '\n' + stderr;

  // Print output
  if (stdout.trim()) console.log(stdout);
  if (stderr.trim() && result.status !== 0) console.log(stderr);

  return {
    success: result.status === 0,
    output: output,
    hasP3005: output.includes('P3005') || output.includes('database schema is not empty'),
  };
}

function main() {
  console.log('🔄 Starting database initialization...\n');

  // Step 1: Try to deploy migrations
  console.log('📦 Step 1: Attempting to deploy migrations...');
  const deployResult = runPrismaCommand('migrate deploy');

  if (deployResult.success) {
    console.log('\n✅ Database initialization complete!');
    process.exit(0);
  }

  // Check if it's the P3005 error (existing schema)
  if (!deployResult.hasP3005) {
    console.error('\n❌ Migration failed with unexpected error.');
    process.exit(1);
  }

  // Step 2: Create baseline for existing database
  console.log('\n📋 Step 2: P3005 detected - creating baseline for existing schema...');
  console.log(`   Marking migration "${INITIAL_MIGRATION}" as already applied.\n`);

  const resolveResult = runPrismaCommand(`migrate resolve --applied ${INITIAL_MIGRATION}`);

  if (!resolveResult.success) {
    console.error('\n❌ Failed to create baseline.');
    process.exit(1);
  }

  console.log('\n✅ Baseline created successfully!');

  // Step 3: Try deploy again for any additional migrations
  console.log('\n🚀 Step 3: Deploying any remaining migrations...');
  const retryResult = runPrismaCommand('migrate deploy');

  if (!retryResult.success) {
    console.error('\n❌ Migration still failed after baseline.');
    process.exit(1);
  }

  console.log('\n✅ Database initialization complete!');
  process.exit(0);
}

try {
  main();
} catch (error) {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
}
