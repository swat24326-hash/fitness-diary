#!/usr/bin/env bash
# Удаление переписки архивных клиентов (scripts/chat-retention-vm.mjs) с переменными из .env, от пользователя приложения.
# .env читает сам Node (--env-file): source нельзя — в DATABASE_URL есть &.
# Запуск: cron (scripts/chat-retention-install-vm.sh) или вручную: sudo bash scripts/chat-retention-vm.sh --dry-run
set -euo pipefail
APP=/opt/fitness-diary
cd "$APP"
exec runuser -u osapp -- node --env-file="$APP/.env" scripts/chat-retention-vm.mjs "$@"
