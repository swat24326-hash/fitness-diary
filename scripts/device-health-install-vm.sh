#!/usr/bin/env bash
# Установить cron центра сбоев устройств: каждые 5 минут — server_no_pull и push админам.
# Usage: sudo bash scripts/device-health-install-vm.sh
set -euo pipefail
cat > /etc/cron.d/fitness-diary-device-health <<'CRON'
# Центр сбоев устройств (scripts/device-health-vm.sh), журнал: journalctl -t fd-device-health
*/5 * * * * root bash /opt/fitness-diary/scripts/device-health-vm.sh 2>&1 | logger -t fd-device-health
CRON
chmod 644 /etc/cron.d/fitness-diary-device-health
echo "cron: $(tail -n1 /etc/cron.d/fitness-diary-device-health)"
bash /opt/fitness-diary/scripts/device-health-vm.sh --dry-run
