#!/usr/bin/env bash
# Третья линия копий (docs/RELIABILITY_PLAN.md, 2b): зашифровать ночную копию и положить в бакет Object Storage.
# Доступ — токен сервисного аккаунта ВМ, без статических ключей. У аккаунта на бакете только загрузка + чтение,
# в бакете версии и блокировка удаления 30 дн. — копию не стереть даже с этой ВМ.
# Usage (зовёт scripts/pg-backup-vm.sh): bash scripts/pg-backup-upload-vm.sh <файл.dump> <бакет>
set -euo pipefail
src="${1:?файл копии}"
bucket="${2:?бакет}"
PASS=/etc/fitness-diary/backup.pass
MD=http://169.254.169.254/computeMetadata/v1

[ -s "$PASS" ] || { echo "pg-backup: облако — нет пароля шифрования $PASS (scripts/pg-backup-cloud-setup-vm.sh)" >&2; exit 1; }
enc=$(mktemp --suffix=.gpg)
trap 'rm -f "$enc"' EXIT
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASS" --symmetric --cipher-algo AES256 -o "$enc" "$src"

token=$(curl -sf --max-time 5 -H 'Metadata-Flavor: Google' "$MD/instance/service-accounts/default/token" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
[ -n "$token" ] || { echo "pg-backup: облако — нет токена сервисного аккаунта ВМ" >&2; exit 1; }
key="daily/$(basename "$src").gpg"
md5=$(openssl dgst -md5 -binary "$enc" | base64)
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 300 -X PUT \
  -H "X-YaCloud-SubjectToken: $token" -H "Content-MD5: $md5" \
  --upload-file "$enc" "https://storage.yandexcloud.net/$bucket/$key" || echo 000)
[ "$code" = 200 ] || { echo "pg-backup: облако — HTTP $code при загрузке $key" >&2; exit 1; }
echo "pg-backup: облако ок $key $(du -h "$enc" | cut -f1)"
