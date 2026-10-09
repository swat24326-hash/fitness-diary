#!/usr/bin/env bash
# Сторож прода → ВК (scripts/ops-alerts-vm.mjs) с переменными из .env. От root: читает journalctl и пишет
# состояние в /var/lib/fitness-diary-ops. .env читает сам Node (--env-file): source нельзя — в DATABASE_URL есть &.
# Запуск: cron (scripts/ops-alerts-install-vm.sh) или вручную: sudo bash scripts/ops-alerts-vm.sh watchdog|report|test
set -euo pipefail
APP=/opt/fitness-diary
cd "$APP"
exec node --env-file="$APP/.env" scripts/ops-alerts-vm.mjs "$@"
