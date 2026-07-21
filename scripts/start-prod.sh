#!/bin/sh
set -e

# Version applicative (node direct ne définit pas npm_package_version)
export APP_VERSION="${APP_VERSION:-$(node -p "require('./package.json').version")}"

echo "🔄 Application des migrations Prisma..."
npx prisma migrate deploy

echo "🚀 Démarrage IMMO-tec API v${APP_VERSION}..."
exec node dist/server.js
