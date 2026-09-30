#!/usr/bin/env bash
# R3 на ВМ: переключить .env на свой домен. Копия — .env.bak-r3 (откат: вернуть её, пересобрать, рестарт).
# HOST=127.0.0.1: приложение видно только через Caddy (лимит входов держится на X-Forwarded-For от Caddy).
# После: sudo bash scripts/r3-deploy-vm.sh <тот же коммит> — VITE_SUPABASE_URL вшивается при сборке.
# Usage: sudo bash scripts/r3-set-origin-vm.sh app-core.ru
set -euo pipefail
DOMAIN="${1:?укажите домен, например app-core.ru}"
ENV_FILE=/opt/fitness-diary/.env
ORIGIN="https://$DOMAIN"

[ -f "$ENV_FILE.bak-r3" ] || cp -p "$ENV_FILE" "$ENV_FILE.bak-r3"
set_key() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i -E "s#^$1=.*#$1=$2#" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
set_key PUBLIC_ORIGIN "$ORIGIN"
set_key VITE_SUPABASE_URL "$ORIGIN"
set_key HOST 127.0.0.1
grep -E '^(PUBLIC_ORIGIN|VITE_SUPABASE_URL|HOST)=' "$ENV_FILE"
