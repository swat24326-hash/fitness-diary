/**
 * Живой просмотр приложения клиента (/me) на тестовых данных — для правки интерфейса без входа на прод.
 * Окно iPhone, клиент уже вошёл по ссылке; правки кода видны сразу (Vite). Закрыть окно — выход.
 * Запуск: node scripts/e2e/preview-client.mjs
 */
import { chromium } from 'playwright'
import { createFakeBackend } from './lib/fakeBackend.mjs'
import { createFakeChat } from './lib/fakeChat.mjs'
import { createFakeClientPortal } from './lib/fakeClientPortal.mjs'
import { ORIGIN, newE2eContext, startDevServer } from './lib/e2eHarness.mjs'
import { CLIENT_ID, TRAINER_ID, isoDay, weightHistorySeed } from './lib/fixtures.mjs'

const INVITE = 'preview-invite'
const backend = createFakeBackend(weightHistorySeed())
const chat = createFakeChat(backend.state)
chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: 'Можно перенести четверг на вечер?' })
const portal = createFakeClientPortal(backend.state, {
  clientId: CLIENT_ID,
  inviteToken: INVITE,
  today: isoDay(0),
  schedule: [
    { day_date: isoDay(2), start_minutes: 600, duration_minutes: 60, trainer_id: TRAINER_ID },
    { day_date: isoDay(4), start_minutes: 1080, duration_minutes: 60, trainer_id: TRAINER_ID },
  ],
})
backend.clientMe = (req) => {
  const authed = /^Bearer .+/.test(String(req.headers.authorization ?? ''))
  if (authed && req.path === '/api/client-me' && req.method === 'POST' && String(req.body?.action ?? '').startsWith('chat-')) {
    return chat.client(CLIENT_ID, req.body)
  }
  const res = portal(req)
  if (req.path === '/api/client-me' && req.method === 'GET' && res.json?.as_of) res.json.chat_attention = chat.attentionForClient(CLIENT_ID)
  return res
}

const server = await startDevServer()
const browser = await chromium.launch({ headless: false })
const context = await newE2eContext(browser, backend, {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
})
/* Датчика на компьютере нет: «Потрясите телефон» сразу показывает, как прыгают точки. */
await context.addInitScript(() => {
  if (globalThis.DeviceMotionEvent) globalThis.DeviceMotionEvent.requestPermission = async () => 'granted'
})
const page = await context.newPage()
await page.goto(`${ORIGIN}/me/join#t=${INVITE}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
await page.waitForURL(`${ORIGIN}/me`, { timeout: 60_000 })
console.log(`Приложение клиента открыто: ${ORIGIN}/me (тестовые данные). Закройте окно, чтобы выйти.`)

browser.on('disconnected', () => {
  server.stop()
  process.exit(0)
})
