#!/usr/bin/env bash
# Прод: выкатка через стенд. Включить стенд → там checkout, миграции, сборка, stand-smoke →
# забрать проверенную сборку → прод (тот же коммит, PREBUILT_DIST) → выключить стенд.
# Стенд не поднялся или smoke упал — прод не трогается. Аварийно без стенда: scripts/r3-deploy-vm.sh.
# Usage: sudo bash scripts/deploy-vm.sh <commit|origin/main>
set -euo pipefail
APP=/opt/fitness-diary
REF="${1:?укажите коммит или origin/main}"
KEY=/root/.ssh/stand_ed25519
CTL="bash $APP/scripts/stand-ctl-vm.sh"
HOST="$(grep -E '^STAND_HOST=' "$APP/.env" | tail -1 | cut -d= -f2-)"
sshs() { ssh -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "ubuntu@$HOST" "$@"; }
vite_sum() { grep -E '^VITE_' | sort | sha256sum | cut -c1-16; }

cd "$APP"
sudo -u osapp git fetch -q origin
COMMIT="$(sudo -u osapp git rev-parse "$REF^{commit}")"
echo "выкатка: $(sudo -u osapp git log --oneline -1 "$COMMIT")"

trap '$CTL stop || echo "stand: не выключился — sudo bash scripts/stand-ctl-vm.sh stop" >&2' EXIT
$CTL start
[[ "$(vite_sum <.env)" == "$(sshs 'sudo cat /opt/fitness-diary/.env' | vite_sum)" ]] \
  || { echo "VITE_* стенда ≠ прод — sudo bash scripts/stand-install-vm.sh" >&2; exit 1; }
sshs "cd /opt/fitness-diary && sudo -u osapp git fetch -q origin && sudo -u osapp git checkout -q --detach $COMMIT \
  && sudo bash scripts/stand-check-vm.sh $COMMIT"

rm -rf .dist-stand && mkdir .dist-stand
sshs 'sudo tar -C /opt/fitness-diary/dist -cf - .' | tar -C .dist-stand -xf -
PREBUILT_DIST="$APP/.dist-stand" bash scripts/r3-deploy-vm.sh "$COMMIT"
echo "прод: выкачен $COMMIT (проверен на стенде)"
