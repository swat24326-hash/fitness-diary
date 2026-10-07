#!/usr/bin/env bash
# Установить ночную копию базы: pg_dump 16 + cron 04:30 МСК (после автокопии Managed PG 01:00–02:00).
# Usage: sudo bash scripts/pg-backup-install-vm.sh
set -euo pipefail
command -v pg_dump >/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client-16; }
cat > /etc/cron.d/fitness-diary-pg-backup <<'CRON'
# Ночная копия прод-базы (scripts/pg-backup-vm.sh), журнал: journalctl -t fd-pg-backup
30 1 * * * root bash /opt/fitness-diary/scripts/pg-backup-vm.sh 2>&1 | logger -t fd-pg-backup
CRON
chmod 644 /etc/cron.d/fitness-diary-pg-backup
echo "cron: $(cat /etc/cron.d/fitness-diary-pg-backup | tail -n1)"
bash /opt/fitness-diary/scripts/pg-backup-vm.sh
