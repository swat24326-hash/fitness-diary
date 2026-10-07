#!/usr/bin/env bash
# Напоминания клиентам (scripts/client-reminders-vm.mjs) с переменными из .env, от пользователя приложения.
# .env читает сам Node (--env-file): source нельзя — в DATABASE_URL есть &.
# Запуск: cron (scripts/client-reminders-install-vm.sh) или вручную: sudo bash scripts/client-reminders-vm.sh --dry-run
set -euo pipefail
APP=/opt/fitness-diary
cd "$APP"
exec runuser -u osapp -- node --env-file="$APP/.env" scripts/client-reminders-vm.mjs "$@"
