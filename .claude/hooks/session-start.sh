#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 300000}'

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$(dirname "$(realpath "$0")")")}"

npm install

if [ -n "${DATABASE_URL:-}" ]; then
  npm run dev &
else
  serve -l tcp://0.0.0.0:5000 dist/public &
fi
