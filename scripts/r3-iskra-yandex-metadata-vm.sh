#!/usr/bin/env bash
# ИСКРА через Yandex AI Studio без секрета: токен берётся у сервисного аккаунта, привязанного к ВМ (iskra-llm).
# Пишет YANDEX_LLM_AUTH=metadata и YANDEX_FOLDER_ID в .env, перезапускает приложение, пробует модель.
# Откат: .env.bak-iskra-llm. Usage: sudo bash scripts/r3-iskra-yandex-metadata-vm.sh
set -euo pipefail
ENV_FILE=/opt/fitness-diary/.env
MD=http://169.254.169.254/computeMetadata/v1

token_json=$(curl -s --max-time 5 -H 'Metadata-Flavor: Google' "$MD/instance/service-accounts/default/token" || true)
case "$token_json" in
  *access_token*) ;;
  *) echo "К ВМ не привязан сервисный аккаунт — сначала задача GrokBot 2026-10-04-03" >&2; exit 1 ;;
esac
folder=$(curl -s --max-time 5 -H 'Metadata-Flavor: Google' "$MD/yandex/folder-id")

[ -f "$ENV_FILE.bak-iskra-llm" ] || cp -p "$ENV_FILE" "$ENV_FILE.bak-iskra-llm"
tmp=$(mktemp)
grep -vE '^(YANDEX_LLM_AUTH|YANDEX_FOLDER_ID)=' "$ENV_FILE" > "$tmp" || true
printf 'YANDEX_LLM_AUTH=metadata\nYANDEX_FOLDER_ID=%s\n' "$folder" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "YANDEX_LLM_AUTH=metadata, YANDEX_FOLDER_ID=$folder"

systemctl restart os-hybrid
echo "приложение перезапущено"

iam=$(printf '%s' "$token_json" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
model=$(grep -E '^YANDEX_LLM_MODEL=' "$ENV_FILE" | cut -d= -f2- || true)
model="${model:-deepseek-v4-flash}"
resp=$(mktemp)
code=$(curl -s --max-time 60 -o "$resp" -w '%{http_code}' \
  -H "Authorization: Bearer $iam" -H "x-folder-id: $folder" -H 'Content-Type: application/json' \
  -d "{\"model\":\"gpt://$folder/$model/latest\",\"messages\":[{\"role\":\"user\",\"content\":\"Ответь одним словом: работает\"}],\"max_tokens\":10,\"reasoning_effort\":\"none\"}" \
  https://ai.api.cloud.yandex.net/v1/chat/completions || echo 000)
msg=$(grep -o '"message": *"[^"]*"' "$resp" | head -1 || true)
reply=$(grep -o '"content": *"[^"]*"' "$resp" | head -1 || true)
rm -f "$resp"
case "$code" in
  200) echo "Яндекс: модель $model ответила ($reply)" ;;
  *) echo "Яндекс: HTTP $code ${msg:-}" ;;
esac
