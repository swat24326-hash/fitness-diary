#!/usr/bin/env bash
# ВМ: выкатить коммит из GitHub — checkout, npm ci, сборка (VITE_* из .env читает сам vite), рестарт, health.
# Локальные несохранённые правки в рабочей копии ВМ не трогаются (git checkout без --force).
# PREBUILT_DIST=<каталог> — взять сборку, проверенную на стенде (scripts/deploy-vm.sh), вместо своей.
# Usage: sudo bash scripts/r3-deploy-vm.sh <commit|origin/main>   (обычный путь — scripts/deploy-vm.sh через стенд)
set -euo pipefail
APP=/opt/fitness-diary
REF="${1:?укажите коммит или origin/main}"
as_app() { sudo -u osapp "$@"; }

cd "$APP"
as_app git fetch -q origin
as_app git checkout -q "$REF"
echo "код: $(as_app git log --oneline -1)"
as_app npm ci --no-audit --no-fund --loglevel=error
if [[ -n "${PREBUILT_DIST:-}" ]]; then
  [[ -f "$PREBUILT_DIST/index.html" ]] || { echo "в $PREBUILT_DIST нет index.html" >&2; exit 1; }
  rm -rf dist.prev
  [[ -d dist ]] && mv dist dist.prev
  mv "$PREBUILT_DIST" dist
  chown -R osapp:osapp dist
  echo "сборка: со стенда"
else
  as_app npm run build --silent >/tmp/fd-build.log 2>&1 || { tail -20 /tmp/fd-build.log; exit 1; }
  echo "сборка: ок ($(grep -E '^VITE_SUPABASE_URL=' .env | cut -d= -f2-))"
fi
systemctl restart os-hybrid
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  if curl -fsS http://127.0.0.1:8080/api/health; then echo; exit 0; fi
done
echo "health не ответил за 20 с — journalctl -u os-hybrid -n 50" >&2
exit 1
