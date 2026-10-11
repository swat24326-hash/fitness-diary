#!/usr/bin/env bash
# Установить cron напоминаний тренерам из Ежедневника: каждые 5 минут, push за 10–15 минут до записи.
# Usage: sudo bash scripts/schedule-reminders-install-vm.sh
set -euo pipefail
cat > /etc/cron.d/fitness-diary-schedule-reminders <<'CRON'
# Напоминания тренерам за 15 минут до записи (scripts/schedule-reminders-vm.sh), журнал: journalctl -t fd-schedule-reminders
*/5 * * * * root bash /opt/fitness-diary/scripts/schedule-reminders-vm.sh 2>&1 | logger -t fd-schedule-reminders
CRON
chmod 644 /etc/cron.d/fitness-diary-schedule-reminders
echo "cron: $(tail -n1 /etc/cron.d/fitness-diary-schedule-reminders)"
bash /opt/fitness-diary/scripts/schedule-reminders-vm.sh --dry-run
