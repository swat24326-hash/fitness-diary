#!/usr/bin/env bash
# Принять строку GEMINI_API_KEY=… из stdin, записать в /opt/fitness-diary/.env, перезапустить приложение
# и одним запросом списка моделей проверить, принимает ли Google ключ с этого сервера (РФ).
# Значение не печатается. Вызывается из scripts/r3-set-gemini-key.ps1.
set -euo pipefail
ENV_FILE=/opt/fitness-diary/.env

IFS= read -r line
line="${line%$'\r'}"
case "$line" in
  GEMINI_API_KEY=?*) ;;
  *) echo "Ожидалась строка GEMINI_API_KEY=…" >&2; exit 1 ;;
esac
key="${line#GEMINI_API_KEY=}"

[ -f "$ENV_FILE.bak-gemini" ] || cp -p "$ENV_FILE" "$ENV_FILE.bak-gemini"
tmp=$(mktemp)
grep -v '^GEMINI_API_KEY=' "$ENV_FILE" > "$tmp" || true
printf '%s\n' "$line" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "GEMINI_API_KEY записан в $ENV_FILE"

systemctl restart os-hybrid
echo "приложение перезапущено"

resp=$(mktemp)
code=$(curl -s --max-time 15 -o "$resp" -w '%{http_code}' -H "x-goog-api-key: $key" \
  'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1' || echo 000)
msg=$(grep -o '"message": *"[^"]*"' "$resp" | head -1 || true)
rm -f "$resp"
case "$code" in
  200) echo "Google: ключ принят с сервера — ИСКРА должна отвечать" ;;
  *) echo "Google: HTTP $code ${msg:-}" ; echo "Ключ записан, но ИСКРА работать не будет — пришлите эту строку агенту" ;;
esac
