#!/usr/bin/env bash
# Прод: включить / выключить / статус ВМ стенда через Compute API. Токен — сервисного аккаунта ВМ из метаданных,
# статических ключей нет. В .env прода: STAND_INSTANCE_ID, STAND_HOST (внутренний IP стенда).
# Usage: sudo bash scripts/stand-ctl-vm.sh start|stop|status
set -euo pipefail
APP=/opt/fitness-diary
ACTION="${1:?start|stop|status}"
env_val() { grep -E "^$1=" "$APP/.env" | tail -1 | cut -d= -f2-; }
ID="$(env_val STAND_INSTANCE_ID)"
HOST="$(env_val STAND_HOST)"
[[ -n "$ID" && -n "$HOST" ]] || { echo "stand: в .env нет STAND_INSTANCE_ID / STAND_HOST" >&2; exit 1; }
API="https://compute.api.cloud.yandex.net/compute/v1/instances/$ID"

token() {
  curl -fsS -H 'Metadata-Flavor: Google' \
    http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token \
    | sed -E 's/.*"access_token":"([^"]+)".*/\1/'
}
status() { curl -fsS -H "Authorization: Bearer $(token)" "$API" | sed -E 's/.*"status":"([A-Z_]+)".*/\1/'; }
wait_status() {
  for _ in $(seq 1 60); do
    [[ "$(status)" == "$1" ]] && return 0
    sleep 5
  done
  echo "stand: за 5 мин не дождались $1 (сейчас $(status))" >&2
  return 1
}

case "$ACTION" in
  status) status ;;
  start)
    # Сразу после stop Yandex какое-то время отвечает 400 — повторяем.
    for _ in $(seq 1 6); do
      [[ "$(status)" == RUNNING ]] && break
      curl -fsS -X POST -H "Authorization: Bearer $(token)" "$API:start" >/dev/null && break
      sleep 15
    done
    wait_status RUNNING
    for _ in $(seq 1 36); do
      timeout 3 bash -c "</dev/tcp/$HOST/22" 2>/dev/null && { echo "stand: включён ($HOST)"; exit 0; }
      sleep 5
    done
    echo "stand: ВМ запущена, но SSH $HOST:22 не ответил за 3 мин" >&2
    exit 1
    ;;
  stop)
    # Без sync свежая сборка на HDD теряется при остановке (index.html 0 байт, 10.10).
    timeout 120 ssh -i /root/.ssh/stand_ed25519 -o BatchMode=yes -o ConnectTimeout=10 "ubuntu@$HOST" 'sudo sync' 2>/dev/null \
      || echo "stand: sync не прошёл — останавливаем как есть" >&2
    [[ "$(status)" == STOPPED ]] || curl -fsS -X POST -H "Authorization: Bearer $(token)" "$API:stop" >/dev/null
    wait_status STOPPED
    echo "stand: выключен"
    ;;
  *) echo "start|stop|status" >&2; exit 2 ;;
esac
