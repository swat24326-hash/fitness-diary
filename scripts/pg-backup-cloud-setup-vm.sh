#!/usr/bin/env bash
# Включить третью линию копий (docs/RELIABILITY_PLAN.md, 2b): пароль шифрования (создаётся один раз, не печатается),
# PG_BACKUP_BUCKET в .env, копия сейчас, cron пробного восстановления 1-го числа 05:00 МСК и первый прогон.
# Бакет и права — задача GrokBot. Пароль владельцу — scripts/pg-backup-show-pass.ps1.
# Usage: sudo bash scripts/pg-backup-cloud-setup-vm.sh <бакет>
set -euo pipefail
BUCKET="${1:?укажите бакет}"
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"
PASS=/etc/fitness-diary/backup.pass

install -d -m 700 /etc/fitness-diary
if [ ! -s "$PASS" ]; then
  (umask 077; openssl rand -base64 32 > "$PASS")
  echo "пароль шифрования создан: $PASS (владелец сохраняет копию — scripts/pg-backup-show-pass.ps1)"
fi

tmp=$(mktemp)
grep -vE '^PG_BACKUP_BUCKET=' "$ENV_FILE" > "$tmp" || true
echo "PG_BACKUP_BUCKET=$BUCKET" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "PG_BACKUP_BUCKET=$BUCKET"

cat > /etc/cron.d/fitness-diary-pg-restore-drill <<'CRON'
# Пробное восстановление копии из бакета (scripts/pg-restore-drill-vm.sh), журнал: journalctl -t fd-pg-restore-drill
0 2 1 * * root bash /opt/fitness-diary/scripts/pg-restore-drill-vm.sh 2>&1 | logger -t fd-pg-restore-drill
CRON
chmod 644 /etc/cron.d/fitness-diary-pg-restore-drill

bash "$APP/scripts/pg-backup-vm.sh" 2>&1 | tee >(logger -t fd-pg-backup)
bash "$APP/scripts/pg-restore-drill-vm.sh" 2>&1 | tee >(logger -t fd-pg-restore-drill)
