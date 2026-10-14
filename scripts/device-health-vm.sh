#!/usr/bin/env bash
# Центр сбоев устройств (scripts/device-health-vm.mjs) с переменными из .env, от пользователя приложения.
# .env читает сам Node (--env-file): source нельзя — в DATABASE_URL есть &.
# Запуск: cron (scripts/device-health-install-vm.sh) или вручную: sudo bash scripts/device-health-vm.sh --dry-run
set -euo pipefail
APP=/opt/fitness-diary
cd "$APP"
exec runuser -u osapp -- node --env-file="$APP/.env" scripts/device-health-vm.mjs "$@"
