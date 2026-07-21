#!/bin/sh
set -e

# Version applicative (node direct ne definit pas npm_package_version)
export APP_VERSION="${APP_VERSION:-$(node -p "require('./package.json').version")}"

echo "Applying Prisma migrations..."
npx prisma migrate deploy

echo "Starting IMMO-tec API v${APP_VERSION}..."
exec node dist/server.js
