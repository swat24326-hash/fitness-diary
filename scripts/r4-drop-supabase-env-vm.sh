#!/usr/bin/env bash
# R4: убрать с ВМ серверные ключи старого Supabase (данные и вход уже на Managed PG + свой Auth).
# VITE_SUPABASE_* не трогаем — они указывают на app-core.ru и нужны сборке фронта.
# Сервис не поднялся или API просит ключи (500 вместо 401) — откат .env. Успех — копия с ключом уничтожается.
# Usage: sudo bash scripts/r4-drop-supabase-env-vm.sh
set -euo pipefail
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"
BAK=/root/.env.bak-r4
KEYS='^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)='

grep -qE '^DATA_BACKEND=pg' "$ENV_FILE" || { echo "DATA_BACKEND не pg — стоп" >&2; exit 1; }
grep -qE '^AUTH_PROVIDER=own' "$ENV_FILE" || { echo "AUTH_PROVIDER не own — стоп" >&2; exit 1; }
if ! grep -qE "$KEYS" "$ENV_FILE"; then echo "ключей Supabase уже нет"; exit 0; fi

umask 077
cat "$ENV_FILE" > "$BAK"
grep -vE "$KEYS" "$BAK" > "$ENV_FILE"
systemctl restart os-hybrid

ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -fsS -o /dev/null http://127.0.0.1:8080/api/health; then ok=1; break; fi
done
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/trainer-pull || true)
if [ "$ok" != 1 ] || [ "$code" != 401 ]; then
  echo "откат: health=$ok, trainer-pull без токена=$code (ждали 401)" >&2
  cat "$BAK" > "$ENV_FILE"
  shred -u "$BAK"
  systemctl restart os-hybrid
  exit 1
fi
shred -u "$BAK"
echo "ключи Supabase убраны; health ок, API без токена → 401"
