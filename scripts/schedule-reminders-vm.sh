#!/usr/bin/env bash
# Напоминания тренерам из Ежедневника (scripts/schedule-reminders-vm.mjs) с переменными из .env, от пользователя приложения.
# .env читает сам Node (--env-file): source нельзя — в DATABASE_URL есть &.
# Запуск: cron (scripts/schedule-reminders-install-vm.sh) или вручную: sudo bash scripts/schedule-reminders-vm.sh --dry-run
set -euo pipefail
APP=/opt/fitness-diary
cd "$APP"
exec runuser -u osapp -- node --env-file="$APP/.env" scripts/schedule-reminders-vm.mjs "$@"
