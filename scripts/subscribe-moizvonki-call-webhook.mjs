/**
 * Подписка Мои Звонки на call.finish → Ось (admin-data?action=moizvonki-webhook).
 *
 * Нужны в env (или .env):
 *   MOIZVONKI_API_BASE / MOIZVONKI_DOMAIN
 *   MOIZVONKI_API_KEY
 *   MOIZVONKI_USER_EMAIL
 *   MOIZVONKI_WEBHOOK_SECRET (≥16 символов)
 *   PUBLIC_ORIGIN или Vercel URL (по умолчанию prod)
 *
 *   node scripts/subscribe-moizvonki-call-webhook.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildMoiZvonkiFormBody,
  getMoiZvonkiConfigFromEnv,
  isMoiZvonkiConfigReady,
} from '../api/_lib/moiZvonkiCore.js'

function readDotEnv(key) {
  const p = resolve('.env')
  if (!existsSync(p)) return ''
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    if (m[1].trim() === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

function env(key) {
  return String(process.env[key] ?? readDotEnv(key) ?? '').trim()
}

const secret = env('MOIZVONKI_WEBHOOK_SECRET')
if (!secret || secret.length < 16) {
  console.error('Задайте MOIZVONKI_WEBHOOK_SECRET (≥16 символов) в env / .env / Vercel')
  process.exit(1)
}

const origin = (
  env('PUBLIC_ORIGIN') ||
  env('VITE_PUBLIC_ORIGIN') ||
  'https://fitness-diary-bice.vercel.app'
).replace(/\/$/, '')

const hookUrl = `${origin}/api/admin-data?action=moizvonki-webhook&secret=${encodeURIComponent(secret)}`

const cfg = getMoiZvonkiConfigFromEnv({
  MOIZVONKI_API_KEY: env('MOIZVONKI_API_KEY'),
  MOIZVONKI_USER_EMAIL: env('MOIZVONKI_USER_EMAIL'),
  MOIZVONKI_API_BASE: env('MOIZVONKI_API_BASE'),
  MOIZVONKI_DOMAIN: env('MOIZVONKI_DOMAIN'),
})
if (!isMoiZvonkiConfigReady(cfg)) {
  console.error('Нужны MOIZVONKI_API_KEY + MOIZVONKI_USER_EMAIL + DOMAIN/API_BASE')
  process.exit(1)
}

const payload = {
  user_name: cfg.userEmail,
  api_key: cfg.apiKey,
  action: 'webhook.subscribe',
  hooks: {
    'call.finish': hookUrl,
  },
}

const res = await fetch(cfg.apiBase, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Accept: 'application/json, text/plain, */*',
  },
  body: buildMoiZvonkiFormBody(payload),
})
const text = await res.text()
console.log('HTTP', res.status)
console.log(text.slice(0, 800))
console.log('\nHook URL (секрет в query):', hookUrl.replace(secret, '***'))
if (!res.ok) process.exit(1)
console.log('Подписка call.finish отправлена. Проверьте кабинет Мои Звонки → webhook.list')
