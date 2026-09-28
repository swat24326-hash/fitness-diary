#!/usr/bin/env bash
# Принять строку DATABASE_URL=… из stdin и записать в /opt/fitness-diary/.env (заменить старую).
# Значение не печатается. Вызывается из scripts/r2-set-database-url.ps1.
set -euo pipefail
ENV_FILE=/opt/fitness-diary/.env

IFS= read -r line
line="${line%$'\r'}"
case "$line" in
  DATABASE_URL=postgres://*) ;;
  *) echo "Ожидалась строка DATABASE_URL=postgres://…" >&2; exit 1 ;;
esac

tmp=$(mktemp)
grep -v '^DATABASE_URL=' "$ENV_FILE" > "$tmp" || true
printf '%s\n' "$line" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "DATABASE_URL записан в $ENV_FILE"
