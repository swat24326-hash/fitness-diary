#!/usr/bin/env bash
# Стенд: первичная настройка тестовой ВМ — Node 22, свой PostgreSQL 16, код, миграции, тестовый клуб, сервис.
# Секретов прода здесь нет: своя база, свой JWT_SECRET; с прода берутся только публичные VITE_* (они и так в бандле).
# Запускает прод: sudo bash scripts/stand-install-vm.sh (копирует этот файл на стенд и вызывает с VITE_* в env).
set -euo pipefail
APP=/opt/fitness-diary
REPO_URL="${REPO_URL:-https://github.com/swat24326-hash/fitness-diary.git}"
: "${VITE_SUPABASE_URL:?нужен VITE_SUPABASE_URL}" "${VITE_SUPABASE_ANON_KEY:?нужен VITE_SUPABASE_ANON_KEY}"
fail() { echo "stand-setup: FAIL $*" >&2; exit 1; }
trap 'fail "строка $LINENO"' ERR

export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null || echo "stand-setup: apt update с предупреждениями"
apt-get install -y ca-certificates curl git openssl postgresql-16 >/dev/null || fail "apt install"
if ! node -v 2>/dev/null | grep -qE '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null || fail "nodejs"
fi
systemctl enable --now postgresql >/dev/null

id -u osapp >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin osapp
[[ -d "$APP/.git" ]] || git clone -q "$REPO_URL" "$APP"
chown -R osapp:osapp "$APP"

if [[ ! -f "$APP/.env" ]]; then
  dbpass="$(openssl rand -hex 24)"
  sudo -u postgres psql -qv ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='osapp') THEN CREATE ROLE osapp LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END \$\$;
ALTER ROLE osapp PASSWORD '$dbpass';
GRANT authenticated, anon TO osapp;
SQL
  sudo -u postgres psql -qtAc "SELECT 1 FROM pg_database WHERE datname='fitness_diary'" | grep -q 1 \
    || sudo -u postgres createdb -O osapp fitness_diary
  umask 077
  cat >"$APP/.env" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=8080
STATIC_DIR=dist
PUBLIC_ORIGIN=http://127.0.0.1:8080
AUTH_PROVIDER=own
DATA_BACKEND=pg
DATABASE_URL=postgresql://osapp:$dbpass@127.0.0.1:5432/fitness_diary
JWT_SECRET=$(openssl rand -hex 32)
VITE_SUPABASE_URL=$VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
VITE_VAPID_PUBLIC_KEY=${VITE_VAPID_PUBLIC_KEY:-}
EOF
  chown osapp:osapp "$APP/.env"
fi

cat >/etc/systemd/system/os-hybrid.service <<EOF
[Unit]
Description=Fitness Diary stand (portable API + static)
After=network.target postgresql.service

[Service]
Type=simple
User=osapp
WorkingDirectory=$APP
EnvironmentFile=$APP/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable os-hybrid >/dev/null

cd "$APP"
sudo -u osapp npm ci --no-audit --no-fund --loglevel=error
sudo -u osapp node --env-file=.env scripts/pg-migrate-all.mjs --with-policies | tail -3
[[ -f "$APP/.c2-seed-credentials" ]] || sudo -u osapp node --env-file=.env scripts/c2-seed-staging.mjs
echo "stand-setup: ок $(sudo -u osapp git log --oneline -1)"
