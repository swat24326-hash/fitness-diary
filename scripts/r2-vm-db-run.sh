#!/usr/bin/env bash
# R2 на ВМ: запустить node-скрипт против Managed PG от osapp (кластер без публичного доступа).
# DATABASE_URL берётся из /opt/fitness-diary/.env и не печатается (source нельзя: в URL есть &).
# Usage: sudo bash scripts/r2-vm-db-run.sh scripts/<script>.mjs [args]
set -euo pipefail
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"
SCRIPT="${1:?укажите scripts/<script>.mjs}"
shift

url=$( (grep -E '^DATABASE_URL=' "$ENV_FILE" || true) | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')
if [ -z "$url" ]; then
  echo "Нет DATABASE_URL в $ENV_FILE — добавьте через защищённую форму." >&2
  exit 1
fi
case "$url" in
  *sslmode=verify-full*sslrootcert=*|*sslrootcert=*sslmode=verify-full*) ;;
  *) echo "В DATABASE_URL нужны sslmode=verify-full&sslrootcert=/etc/ssl/yandex/CA.pem" >&2; exit 1 ;;
esac
echo "target: $(printf '%s' "$url" | sed -E 's#//([^:]+):[^@]*@#//\1:***@#')"

env_val() { (grep -E "^$1=" "$ENV_FILE" || true) | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
# Источник для r3-copy-data.mjs (облако Supabase); другим скриптам не мешает.
SUPABASE_URL=$(env_val SUPABASE_URL)
SUPABASE_SERVICE_ROLE_KEY=$(env_val SUPABASE_SERVICE_ROLE_KEY)

cd "$APP"
export DATABASE_URL="$url" SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
sudo --preserve-env=DATABASE_URL,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY -u osapp node "$SCRIPT" "$@"
