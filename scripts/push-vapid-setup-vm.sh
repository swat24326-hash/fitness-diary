#!/usr/bin/env bash
# Ключи Web Push (VAPID) на ВМ: сгенерировать прямо в .env, ничего не печатая. Рабочие ключи не трогает —
# смена ключей отвязывает все подписки (сотрудникам — «Переподключить», клиентам — включить заново).
# После: sudo bash scripts/r3-deploy-vm.sh origin/main (VITE_VAPID_PUBLIC_KEY попадает в сборку).
# Usage: sudo bash scripts/push-vapid-setup-vm.sh [--force]
set -euo pipefail
APP=/opt/fitness-diary
ENV_FILE="$APP/.env"
cd "$APP"
runuser -u osapp -- node --env-file="$ENV_FILE" --input-type=module - "$ENV_FILE" "${1:-}" <<'JS'
import fs from 'node:fs'
import webpush from 'web-push'
import { isValidVapidPublicKey } from '/opt/fitness-diary/src/lib/push/trainerPushCore.js'

const [file, flag] = process.argv.slice(2)
if (isValidVapidPublicKey(process.env.VAPID_PUBLIC_KEY) && flag !== '--force') {
  console.log('push-vapid: ключи уже рабочие — не трогаю (--force для смены)')
  process.exit(0)
}
const keys = webpush.generateVAPIDKeys()
const want = {
  VAPID_PUBLIC_KEY: keys.publicKey,
  VITE_VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: 'https://app-core.ru',
}
const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => !Object.keys(want).some((k) => l.startsWith(`${k}=`)))
while (lines.length && lines.at(-1) === '') lines.pop()
for (const [k, v] of Object.entries(want)) lines.push(`${k}=${v}`)
fs.copyFileSync(file, `${file}.bak-vapid`)
fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 })
console.log('push-vapid: ключи записаны в .env (копия прежнего — .env.bak-vapid)')
JS
