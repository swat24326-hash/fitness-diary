#!/usr/bin/env bash
# Напоминания клиентам (scripts/client-reminders-vm.mjs) с переменными из .env, от пользователя приложения.
# Запуск: cron (scripts/client-reminders-install-vm.sh) или вручную: sudo bash scripts/client-reminders-vm.sh --dry-run
set -euo pipefail
APP=/opt/fitness-diary
cd "$APP"
set -a
# shellcheck disable=SC1091
source "$APP/.env"
set +a
exec runuser -u osapp -- node scripts/client-reminders-vm.mjs "$@"
