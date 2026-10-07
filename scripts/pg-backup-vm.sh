#!/usr/bin/env bash
# Ночная логическая копия прод-базы на диск ВМ — вторая линия к автокопиям Managed PG (7 дней, тот же кластер).
# Защищает от удаления кластера / порчи данных, которую заметили позже недели. Хранение 14 дней.
# Запуск: cron (scripts/pg-backup-install-vm.sh) или вручную: sudo bash scripts/pg-backup-vm.sh
set -euo pipefail
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"
DIR=/var/backups/fitness-diary/daily
KEEP_DAYS=14

url=$( (grep -E '^DATABASE_URL=' "$ENV_FILE" || true) | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')
[ -n "$url" ] || { echo "pg-backup: нет DATABASE_URL" >&2; exit 1; }

install -d -m 700 -o osapp -g osapp "$DIR"
out="$DIR/fd-$(date -u +%F).dump"
tmp="$out.part"
sudo -u osapp env PGCONNECT_TIMEOUT=20 pg_dump --format=custom --no-owner --no-privileges --dbname="$url" --file="$tmp"
tables=$(sudo -u osapp pg_restore --list "$tmp" | grep -c ' TABLE DATA ' || true)
[ "$tables" -ge 20 ] || { echo "pg-backup: в копии мало таблиц ($tables) — не принимаю" >&2; rm -f "$tmp"; exit 1; }
chmod 600 "$tmp"
mv -f "$tmp" "$out"
find "$DIR" -name 'fd-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "pg-backup: ок $(basename "$out") $(du -h "$out" | cut -f1), таблиц с данными $tables, копий $(ls "$DIR"/fd-*.dump | wc -l)"
