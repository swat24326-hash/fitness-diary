#!/usr/bin/env bash
# ИСКРА через Yandex AI Studio: принять строку YANDEX_LLM_API_KEY=… из stdin, записать в /opt/fitness-diary/.env
# вместе с YANDEX_FOLDER_ID (из метаданных ВМ), перезапустить приложение и одним коротким запросом проверить модель.
# Значение ключа не печатается. Вызывается из scripts/r3-set-yandex-llm-key.ps1. Откат: .env.bak-iskra-llm.
set -euo pipefail
ENV_FILE=/opt/fitness-diary/.env

IFS= read -r line
line="${line%$'\r'}"
case "$line" in
  YANDEX_LLM_API_KEY=?*) ;;
  *) echo "Ожидалась строка YANDEX_LLM_API_KEY=…" >&2; exit 1 ;;
esac
key="${line#YANDEX_LLM_API_KEY=}"

folder=$(curl -s --max-time 5 -H 'Metadata-Flavor: Google' \
  http://169.254.169.254/computeMetadata/v1/yandex/folder-id || true)
[ -n "$folder" ] || { echo "Не удалось узнать каталог ВМ" >&2; exit 1; }

[ -f "$ENV_FILE.bak-iskra-llm" ] || cp -p "$ENV_FILE" "$ENV_FILE.bak-iskra-llm"
tmp=$(mktemp)
grep -vE '^(YANDEX_LLM_API_KEY|YANDEX_FOLDER_ID)=' "$ENV_FILE" > "$tmp" || true
printf '%s\nYANDEX_FOLDER_ID=%s\n' "$line" "$folder" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "YANDEX_LLM_API_KEY и YANDEX_FOLDER_ID ($folder) записаны"

systemctl restart os-hybrid
echo "приложение перезапущено"

model=$(grep -E '^YANDEX_LLM_MODEL=' "$ENV_FILE" | cut -d= -f2- || true)
model="${model:-deepseek-v4-flash}"
resp=$(mktemp)
code=$(curl -s --max-time 60 -o "$resp" -w '%{http_code}' \
  -H "Authorization: Api-Key $key" -H "x-folder-id: $folder" -H 'Content-Type: application/json' \
  -d "{\"model\":\"gpt://$folder/$model/latest\",\"messages\":[{\"role\":\"user\",\"content\":\"Ответь одним словом: работает\"}],\"max_tokens\":10,\"reasoning_effort\":\"none\"}" \
  https://ai.api.cloud.yandex.net/v1/chat/completions || echo 000)
msg=$(grep -o '"message": *"[^"]*"' "$resp" | head -1 || true)
rm -f "$resp"
case "$code" in
  200) echo "Яндекс: модель $model ответила — ИСКРА должна работать" ;;
  *) echo "Яндекс: HTTP $code ${msg:-}"; echo "Ключ записан, но модель не ответила — пришлите эту строку агенту" ;;
esac
