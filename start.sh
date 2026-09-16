#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Спочатку встановіть Node.js 18+ з https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Встановлюю залежності..."
  npm install
fi

export OPEN_BROWSER="${OPEN_BROWSER:-1}"
echo "Запускаю iCore Store..."
exec node src/server.js
