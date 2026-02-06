#!/bin/bash
# Database initialization script for production
# Handles baseline for existing databases that were managed with `prisma db push`

set -e

echo "🔄 Starting database initialization..."

# Check if _prisma_migrations table exists
MIGRATION_TABLE_EXISTS=$(npx prisma db execute --stdin <<< "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations');" 2>/dev/null | grep -c "t" || echo "0")

if [ "$MIGRATION_TABLE_EXISTS" = "0" ]; then
  echo "📋 No migrations table found. Checking if database has existing schema..."

  # Check if any tables exist (excluding system tables)
  TABLE_COUNT=$(npx prisma db execute --stdin <<< "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "0")

  if [ "$TABLE_COUNT" -gt "0" ]; then
    echo "🏗️ Existing schema detected ($TABLE_COUNT tables). Creating baseline..."

    # Mark the initial migration as applied (baseline)
    npx prisma migrate resolve --applied 20250206000000_init

    echo "✅ Baseline created successfully"
  else
    echo "📦 Empty database detected. Will apply migrations from scratch."
  fi
else
  echo "✅ Migrations table exists. Proceeding with normal deployment."
fi

# Deploy any pending migrations
echo "🚀 Deploying migrations..."
npx prisma migrate deploy

echo "✅ Database initialization complete!"
