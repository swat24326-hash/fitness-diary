#!/usr/bin/env bash
# Установить cron удаления переписки архивных клиентов: раз в сутки в 05:00 МСК (ВМ в UTC), после ночной копии базы 04:30.
# Usage: sudo bash scripts/chat-retention-install-vm.sh
set -euo pipefail
cat > /etc/cron.d/fitness-diary-chat-retention <<'CRON'
# Переписка клиентов, которые больше 90 дней в архиве (scripts/chat-retention-vm.sh), журнал: journalctl -t fd-chat-retention
0 2 * * * root bash /opt/fitness-diary/scripts/chat-retention-vm.sh 2>&1 | logger -t fd-chat-retention
CRON
chmod 644 /etc/cron.d/fitness-diary-chat-retention
echo "cron: $(tail -n1 /etc/cron.d/fitness-diary-chat-retention)"
bash /opt/fitness-diary/scripts/chat-retention-vm.sh --dry-run
