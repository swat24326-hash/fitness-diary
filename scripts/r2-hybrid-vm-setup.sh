#!/usr/bin/env bash
# Hybrid A на Ubuntu 24.04 (Yandex Compute). Секреты в .env — руками, не в этот файл.
# Usage (на ВМ, из корня клона):
#   sudo bash scripts/r2-hybrid-vm-setup.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fitness-diary}"
APP_USER="${APP_USER:-osapp}"
REPO_URL="${REPO_URL:-https://github.com/swat24326-hash/fitness-diary.git}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запустите через sudo."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(2[2-9]|[3-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "Создайте $APP_DIR/.env (блок Hybrid из .env.example) и запустите скрипт снова."
  exit 2
fi

set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +a

sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm ci && npm run build"

cat >/etc/systemd/system/os-hybrid.service <<EOF
[Unit]
Description=Fitness Diary Hybrid A (portable API + static)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=8080
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now os-hybrid.service
sleep 1
curl -fsS "http://127.0.0.1:8080/api/health" || true
echo "Готово. Снаружи: http://<публичный-IP>:8080/api/health"
