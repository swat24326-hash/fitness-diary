#!/usr/bin/env bash
# Пробный / ручной запуск оповещений об абонементе. Cron пока НЕ ставим (см. CLIENT_APP.md).
# Usage: sudo bash scripts/client-membership-notices-vm.sh [--dry-run]
set -euo pipefail
cd /opt/fitness-diary
exec sudo -u osapp node --env-file=.env scripts/client-membership-notices-vm.mjs "$@"
