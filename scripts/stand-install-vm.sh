#!/usr/bin/env bash
# Прод: подключить стенд — STAND_* в .env, SSH-ключ root прода, первичная настройка стенда (stand-setup-vm.sh).
# Повторный запуск безопасен: обновит VITE_* стенда под прод не трогая базу стенда.
# Usage: sudo bash scripts/stand-install-vm.sh [<instance-id> <внутренний-IP>]
set -euo pipefail
APP=/opt/fitness-diary
KEY=/root/.ssh/stand_ed25519
cd "$APP"

set_env() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >>.env; fi
}
if [[ $# -ge 2 ]]; then
  set_env STAND_INSTANCE_ID "$1"
  set_env STAND_HOST "$2"
fi
HOST="$(grep -E '^STAND_HOST=' .env | tail -1 | cut -d= -f2-)"
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N '' -C 'prod-root-to-stand' -f "$KEY"
sshs() { ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "ubuntu@$HOST" "$@"; }

trap 'bash scripts/stand-ctl-vm.sh stop || true' EXIT
bash scripts/stand-ctl-vm.sh start
if ! sshs true 2>/dev/null; then
  echo "Ключ прода не пустили на стенд. Добавьте в ~ubuntu/.ssh/authorized_keys стенда:" >&2
  cat "$KEY.pub" >&2
  exit 3
fi

vite_env="$(grep -E '^VITE_(SUPABASE_URL|SUPABASE_ANON_KEY|VAPID_PUBLIC_KEY)=' .env | sed 's/^/export /')"
sshs 'sudo tee /tmp/stand-setup-vm.sh >/dev/null' <scripts/stand-setup-vm.sh
sshs "sudo bash -c '$vite_env; bash /tmp/stand-setup-vm.sh'"
for k in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_VAPID_PUBLIC_KEY; do
  v="$(grep -E "^$k=" .env | tail -1 | cut -d= -f2-)"
  sshs "sudo sed -i 's|^$k=.*|$k=$v|' /opt/fitness-diary/.env"
done
sshs "sudo bash /opt/fitness-diary/scripts/stand-check-vm.sh origin/main"
echo "stand-install: ок — дальше выкатка только через sudo bash scripts/deploy-vm.sh origin/main"
