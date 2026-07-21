#!/bin/sh
set -e

APP_VERSION=$(node -p "require('./package.json').version")
export APP_VERSION

echo "Applying Prisma migrations..."
npx prisma migrate deploy

echo "Starting IMMO-tec API v${APP_VERSION}..."
exec node dist/server.js
