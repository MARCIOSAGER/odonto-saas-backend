#!/bin/sh
set -e

echo "Ensuring uploads directories exist..."
mkdir -p uploads/logos uploads/favicons

echo "Applying database schema..."
npx prisma db push --skip-generate

echo "Starting application..."
exec node dist/main
