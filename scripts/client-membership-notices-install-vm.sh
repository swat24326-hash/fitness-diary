#!/usr/bin/env bash
# Отдельный cron не нужен: оповещения об абонементе идут из client-reminders-vm.sh
# (тот же */15, окно 10:00–12:00 проверяет код).
# Usage: sudo bash scripts/client-membership-notices-install-vm.sh
set -euo pipefail
echo "Отдельный cron не ставим — задача в scripts/client-reminders-vm.mjs (уже на ВМ)."
echo "Пробный прогон:"
bash /opt/fitness-diary/scripts/client-membership-notices-vm.sh --dry-run
