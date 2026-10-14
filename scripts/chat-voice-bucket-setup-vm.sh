#!/usr/bin/env bash
# Голосовые в переписке (docs/CHAT.md): CHAT_VOICE_BUCKET в .env, проверка записи и чтения токеном ВМ, перезапуск.
# Бакет, правило «удалить через 1 день» и права сервисного аккаунта ВМ — заранее, docs/RUNBOOK.md § «Голосовые».
# Откат: .env.bak-chat-voice. Usage: sudo bash scripts/chat-voice-bucket-setup-vm.sh <бакет>
set -euo pipefail
BUCKET="${1:?укажите бакет}"
ENV_FILE=/opt/fitness-diary/.env
MD=http://169.254.169.254/computeMetadata/v1

token=$(curl -sf --max-time 5 -H 'Metadata-Flavor: Google' "$MD/instance/service-accounts/default/token" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
[ -n "$token" ] || { echo "К ВМ не привязан сервисный аккаунт" >&2; exit 1; }

key="voice/setup-check-$(date +%s).mp3"
url="https://storage.yandexcloud.net/$BUCKET/$key"
put=$(printf 'ID3check' | curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X PUT \
  -H "X-YaCloud-SubjectToken: $token" -H 'Content-Type: audio/mpeg' --data-binary @- "$url" || echo 000)
[ "$put" = 200 ] || { echo "Запись в бакет $BUCKET: HTTP $put — проверьте права сервисного аккаунта" >&2; exit 1; }
got=$(curl -s --max-time 20 -H "X-YaCloud-SubjectToken: $token" "$url" || true)
[ "$got" = ID3check ] || { echo "Чтение из бакета $BUCKET не вернуло файл — проверьте права на чтение" >&2; exit 1; }
echo "бакет $BUCKET: запись и чтение ок (проверочный файл удалит правило бакета)"

[ -f "$ENV_FILE.bak-chat-voice" ] || cp -p "$ENV_FILE" "$ENV_FILE.bak-chat-voice"
tmp=$(mktemp)
grep -vE '^CHAT_VOICE_BUCKET=' "$ENV_FILE" > "$tmp" || true
echo "CHAT_VOICE_BUCKET=$BUCKET" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "CHAT_VOICE_BUCKET=$BUCKET"

systemctl restart os-hybrid
echo "приложение перезапущено — голосовые включены"
