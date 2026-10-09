#!/usr/bin/env bash
# Пробное восстановление (docs/RELIABILITY_PLAN.md, 2b): последняя копия из бакета → расшифровать → временный Postgres
# на ВМ (только unix-сокет, без сети) → сверить строки ключевых таблиц с продом → удалить. Прод не трогаем.
# Запуск: cron 1-го числа (scripts/pg-backup-cloud-setup-vm.sh) или вручную: sudo bash scripts/pg-restore-drill-vm.sh
set -euo pipefail
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"
PASS=/etc/fitness-diary/backup.pass
MD=http://169.254.169.254/computeMetadata/v1
PGBIN=/usr/lib/postgresql/16/bin
PORT=5499
TABLES="clients trainings memberships users"

fail() { echo "pg-restore-drill: FAIL $(date -u +%F) $*"; exit 1; }
env_val() { (grep -E "^$1=" "$ENV_FILE" || true) | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; }
bucket=$(env_val PG_BACKUP_BUCKET)
url=$(env_val DATABASE_URL)
[ -n "$bucket" ] && [ -n "$url" ] || fail "нет PG_BACKUP_BUCKET или DATABASE_URL"
[ -s "$PASS" ] || fail "нет пароля шифрования $PASS"
if [ ! -x "$PGBIN/initdb" ]; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16 >/dev/null
  systemctl disable --now postgresql >/dev/null 2>&1 || true
fi

token=$(curl -sf --max-time 5 -H 'Metadata-Flavor: Google' "$MD/instance/service-accounts/default/token" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
[ -n "$token" ] || fail "нет токена сервисного аккаунта ВМ"
key=$(curl -sf --max-time 30 -H "X-YaCloud-SubjectToken: $token" "https://storage.yandexcloud.net/$bucket?list-type=2&prefix=daily/" \
  | grep -o '<Key>[^<]*</Key>' | sed -E 's#</?Key>##g' | sort | tail -n1 || true)
[ -n "$key" ] || fail "в бакете нет копий"

work=$(mktemp -d)
cleanup() {
  runuser -u postgres -- "$PGBIN/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
chown postgres "$work"
curl -sf --max-time 300 -H "X-YaCloud-SubjectToken: $token" -o "$work/copy.gpg" "https://storage.yandexcloud.net/$bucket/$key" || fail "не скачалась $key"
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$PASS" -d -o "$work/copy.dump" "$work/copy.gpg" || fail "не расшифровалась $key"
chown postgres "$work/copy.dump"

pg() { runuser -u postgres -- "$@"; }
pg "$PGBIN/initdb" -D "$work/data" -A trust -U postgres >/dev/null
pg "$PGBIN/pg_ctl" -D "$work/data" -o "-p $PORT -k $work -c listen_addresses=''" -w start >/dev/null
pg "$PGBIN/psql" -h "$work" -p $PORT -qc "CREATE DATABASE drill" -c "CREATE ROLE authenticated" -c "CREATE ROLE anon" -c "CREATE ROLE service_role" >/dev/null
errors=$(pg "$PGBIN/pg_restore" -h "$work" -p $PORT -d drill --no-owner --no-privileges "$work/copy.dump" 2>&1 | grep -c 'error:' || true)

summary=""
for t in $TABLES; do
  got=$(pg "$PGBIN/psql" -h "$work" -p $PORT -d drill -tAc "SELECT count(*) FROM public.$t" 2>/dev/null || echo -1)
  prod=$(runuser -u osapp -- env PGCONNECT_TIMEOUT=20 psql "$url" -tAc "SELECT count(*) FROM public.$t")
  summary="$summary $t $got/$prod"
  [ "$got" -ge 0 ] || fail "$key: таблица $t не восстановилась"
  [ "$prod" -eq 0 ] || [ $((got * 10)) -ge $((prod * 9)) ] || fail "$key: $t в копии $got, в проде $prod"
done
echo "pg-restore-drill: ок $(date -u +%F) $key, строк копия/прод:$summary, ошибок восстановления $errors"
