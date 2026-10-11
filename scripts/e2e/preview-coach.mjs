/**
 * Живой просмотр приложения тренера (/coach) на тестовых данных — для правки интерфейса без входа на прод.
 * Окно iPhone, тренер уже вошёл и разрешён; правки кода видны сразу (Vite). Закрыть окно — выход.
 * Запуск: node scripts/e2e/preview-coach.mjs
 */
import { chromium } from 'playwright'
import { createFakeBackend } from './lib/fakeBackend.mjs'
import { createFakeChat } from './lib/fakeChat.mjs'
import { createFakeCoach } from './lib/fakeCoach.mjs'
import { ORIGIN, newE2eContext, startDevServer } from './lib/e2eHarness.mjs'
import { CLIENT_ID, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from './lib/fixtures.mjs'

const backend = createFakeBackend(trainerClubSeed())
const chat = createFakeChat(backend.state)
chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: 'Завтра можно перенести на вечер?' })
const slot = (id, day, start, extra = {}) => ({
  id, club_id: CLUB_ID, trainer_id: TRAINER_ID, day_date: isoDay(day), start_minutes: start, duration_minutes: 60, title: '', client_ids: [CLIENT_ID], ...extra,
})
const coach = createFakeCoach(backend.state, chat, {
  trainerId: TRAINER_ID,
  today: isoDay(0),
  schedule: [slot('p1', 0, 600), slot('p2', 0, 780, { title: 'Групповая', client_ids: [] }), slot('p3', 1, 1080)],
})
backend.coach = coach.handle

const server = await startDevServer()
const browser = await chromium.launch({ headless: false })
const context = await newE2eContext(browser, backend, {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
})
const page = await context.newPage()
await page.goto(`${ORIGIN}/coach`)
await page.getByLabel('Логин').fill(TRAINER_LOGIN)
await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
await page.getByRole('button', { name: 'Войти' }).click()
coach.setPhoneStatus('approved')
await page.getByRole('button', { name: 'Проверить сейчас' }).click()
console.log(`Приложение тренера открыто: ${ORIGIN}/coach (тестовые данные). Закройте окно, чтобы выйти.`)

browser.on('disconnected', () => {
  server.stop()
  process.exit(0)
})
