#!/usr/bin/env bash
# Установить cron напоминаний клиентам: каждые 15 минут, отправляет только в 19:00–22:00 по часам клуба.
# Usage: sudo bash scripts/client-reminders-install-vm.sh
set -euo pipefail
cat > /etc/cron.d/fitness-diary-client-reminders <<'CRON'
# Напоминания клиентам о завтрашней тренировке (scripts/client-reminders-vm.sh), журнал: journalctl -t fd-client-reminders
*/15 * * * * root bash /opt/fitness-diary/scripts/client-reminders-vm.sh 2>&1 | logger -t fd-client-reminders
CRON
chmod 644 /etc/cron.d/fitness-diary-client-reminders
echo "cron: $(tail -n1 /etc/cron.d/fitness-diary-client-reminders)"
bash /opt/fitness-diary/scripts/client-reminders-vm.sh --dry-run
