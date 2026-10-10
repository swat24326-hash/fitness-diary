#!/usr/bin/env bash
# Стенд: проверить коммит перед продом — checkout, npm ci, миграции на базу стенда, сборка, рестарт, stand-smoke.
# Usage (на стенде, вызывает scripts/deploy-vm.sh с прода): sudo bash scripts/stand-check-vm.sh <commit>
set -euo pipefail
APP=/opt/fitness-diary
REF="${1:?укажите коммит}"
as_app() { sudo -u osapp "$@"; }
fail() { echo "stand-check: FAIL $*" >&2; exit 1; }

cd "$APP"
as_app git fetch -q origin
as_app git checkout -q --detach "$REF"
echo "стенд: $(as_app git log --oneline -1)"
as_app npm ci --no-audit --no-fund --loglevel=error || fail "npm ci"
as_app node --env-file=.env scripts/pg-migrate-all.mjs --with-policies >/tmp/fd-stand-migrate.log 2>&1 \
  || { tail -20 /tmp/fd-stand-migrate.log; fail "миграции"; }
echo "миграции: ок"
as_app npm run build --silent >/tmp/fd-build.log 2>&1 || { tail -20 /tmp/fd-build.log; fail "сборка"; }
echo "сборка: ок"
systemctl restart os-hybrid
for _ in $(seq 1 15); do
  sleep 2
  curl -fsS -o /dev/null http://127.0.0.1:8080/api/health && break
done
as_app node scripts/stand-smoke.mjs || { journalctl -u os-hybrid -n 30 --no-pager; fail "smoke"; }
echo "stand-check: ок $(as_app git rev-parse HEAD)"
