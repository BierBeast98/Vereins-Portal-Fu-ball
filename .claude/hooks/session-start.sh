#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 300000}'

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$(dirname "$(realpath "$0")")")}"

# Install dependencies
npm install

# Setup PostgreSQL
service postgresql start || true
sleep 2

# Create DB user and database if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='vereinsuser'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER vereinsuser WITH PASSWORD 'vereinspass';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='vereinsportal'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE vereinsportal OWNER vereinsuser;"

sudo -u postgres psql -d vereinsportal -c "GRANT ALL ON SCHEMA public TO vereinsuser;" 2>/dev/null || true

# Write DATABASE_URL to env file
export DATABASE_URL="postgresql://vereinsuser:vereinspass@localhost:5432/vereinsportal"
echo "export DATABASE_URL=\"${DATABASE_URL}\"" >> "${CLAUDE_ENV_FILE:-/dev/null}"

# Push DB schema
DATABASE_URL="${DATABASE_URL}" npm run db:push

# Start dev server in background
DATABASE_URL="${DATABASE_URL}" npm run dev &
