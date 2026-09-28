#!/usr/bin/env bash
# Волна 2 R2: накатить схему на Managed PG с VM (кластер без публичного доступа).
# DATABASE_URL берётся из /opt/fitness-diary/.env и не печатается.
# Usage: sudo bash r2-pg-migrate-vm.sh [--dry-run]
set -euo pipefail
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"

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

cd "$APP"
export DATABASE_URL="$url"
sudo --preserve-env=DATABASE_URL -u osapp node scripts/pg-migrate-all.mjs "$@"
