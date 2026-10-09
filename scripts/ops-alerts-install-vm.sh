#!/usr/bin/env bash
# Установить сторожа прода: проверка раз в минуту + сводка в 06:00 МСК (после копии базы в 04:30). ВМ в UTC.
# Нужны VK_ALERT_TOKEN и VK_ALERT_PEER_IDS в .env — scripts/ops-set-vk-alert-key.ps1.
# Usage: sudo bash scripts/ops-alerts-install-vm.sh
set -euo pipefail
cat > /etc/cron.d/fitness-diary-ops-alerts <<'CRON'
# Сторож прода → ВК (scripts/ops-alerts-vm.sh), журнал: journalctl -t fd-ops-alerts
* * * * * root bash /opt/fitness-diary/scripts/ops-alerts-vm.sh watchdog 2>&1 | logger -t fd-ops-alerts
0 3 * * * root bash /opt/fitness-diary/scripts/ops-alerts-vm.sh report 2>&1 | logger -t fd-ops-alerts
CRON
chmod 644 /etc/cron.d/fitness-diary-ops-alerts
echo "cron:"; grep -v '^#' /etc/cron.d/fitness-diary-ops-alerts
bash /opt/fitness-diary/scripts/ops-alerts-vm.sh watchdog
bash /opt/fitness-diary/scripts/ops-alerts-vm.sh report
