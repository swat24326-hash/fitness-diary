#!/usr/bin/env bash
# Сторож прода → ВК: принять строку VK_ALERT_TOKEN=… из stdin, записать в /opt/fitness-diary/.env, найти получателей
# (кто написал сообществу) → VK_ALERT_PEER_IDS, отправить «проверку связи». Значение ключа не печатается.
# Вызывается из scripts/ops-set-vk-alert-key.ps1. Приложение не перезапускается: ключ читает только сторож.
set -euo pipefail
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"

IFS= read -r line
line="${line%$'\r'}"
case "$line" in
  VK_ALERT_TOKEN=?*) ;;
  *) echo "Ожидалась строка VK_ALERT_TOKEN=…" >&2; exit 1 ;;
esac

set_line() {
  local tmp
  tmp=$(mktemp)
  grep -vE "^${1%%=*}=" "$ENV_FILE" > "$tmp" || true
  printf '%s\n' "$1" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

[ -f "$ENV_FILE.bak-vk-alert" ] || cp -p "$ENV_FILE" "$ENV_FILE.bak-vk-alert"
set_line "$line"
echo "VK_ALERT_TOKEN записан"

peers=$(bash "$APP/scripts/ops-alerts-vm.sh" peers)
set_line "$peers"
echo "$peers записан"

bash "$APP/scripts/ops-alerts-vm.sh" test
