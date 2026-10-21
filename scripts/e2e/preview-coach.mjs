/**
 * Живой просмотр приложения тренера (/coach) на тестовых данных — для правки интерфейса без входа на прод.
 * Окно iPhone, тренер уже вошёл и разрешён; правки кода видны сразу (Vite). Закрыть окно — выход.
 * Запуск: node scripts/e2e/preview-coach.mjs
 */
import { chromium } from 'playwright'
import { createFakeBackend } from './lib/fakeBackend.mjs'
import { createFakeChat } from './lib/fakeChat.mjs'
import { createFakeCoach } from './lib/fakeCoach.mjs'
import { ORIGIN, fillCoachCredentials, newE2eContext, startDevServer } from './lib/e2eHarness.mjs'
import { CLIENT_ID, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from './lib/fixtures.mjs'

const backend = createFakeBackend(trainerClubSeed())
const chat = createFakeChat(backend.state)
chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: 'Сообщение с прошлой недели' })
chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: 'Ещё одно за тот день' })
if (chat.state.messages[0]) chat.state.messages[0].created_at = new Date(Date.now() - 4 * 864e5).toISOString()
if (chat.state.messages[1]) chat.state.messages[1].created_at = new Date(Date.now() - 4 * 864e5 + 60_000).toISOString()
chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: 'Завтра можно перенести на вечер?' })
chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: 'Жду ответа' })
const slot = (id, day, start, extra = {}) => ({
  id, club_id: CLUB_ID, trainer_id: TRAINER_ID, day_date: isoDay(day), start_minutes: start, duration_minutes: 60, title: '', client_ids: [CLIENT_ID], ...extra,
})
const own = (id, name, extra = {}) => ({ id, name, trainer_id: TRAINER_ID, club_id: CLUB_ID, phone: '', birth_date: null, ...extra })
Object.assign(backend.state.clients[0], { phone: '+7 999 111-22-33', card_number: '5870' })
backend.state.clients.push(
  own('p-boris', 'Борис Продлеваев', { card_number: '3334', phone: '+7 999 222-33-44' }),
  own('p-vera', 'Вера Новая', { lifecycle: 'pnk', card_number: '4412', birth_date: `1990-${isoDay(1).slice(5)}` }),
)
const mem = (id, clientId, start, end, total, used, typeId = 'p-type') => ({
  id, client_id: clientId, start_date: isoDay(start), end_date: isoDay(end), total_trainings: total, used_trainings: used, membership_type_id: typeId,
})
backend.state.membership_types = [
  { id: 'p-type', club_id: CLUB_ID, code: 'ПЗ 10', name: 'ПЗ 10' },
  { id: 'p-type-vip', club_id: CLUB_ID, code: 'Vip 2', name: 'Vip 2' },
]
backend.state.memberships = [
  mem('p-m1', CLIENT_ID, -20, 3, 10, 3),
  mem('p-m0', CLIENT_ID, -80, -21, 8, 8),
  mem('p-m2', 'p-boris', -10, 40, 10, 6, 'p-type-vip'),
  mem('p-m3', 'p-vera', -5, 25, 8, 1, 'p-type-vip'),
]
const coach = createFakeCoach(backend.state, chat, {
  trainerId: TRAINER_ID,
  today: isoDay(0),
  schedule: [
    slot('p1', 0, 600),
    slot('p-vera', 0, 16 * 60, { client_ids: ['p-vera'] }),
    slot('p2', 0, 780, { title: 'Групповая', client_ids: [] }),
    slot('p3', 1, 1080),
  ],
  clientsData: {
    memberships: backend.state.memberships,
    trainings: [{ client_id: CLIENT_ID, date: isoDay(-2), status: 'completed' }],
    typeCodeById: { 'p-type': 'ПЗ 10', 'p-type-vip': 'Vip 2' },
  },
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
await fillCoachCredentials(page, TRAINER_LOGIN, TRAINER_PASSWORD)
await page.getByRole('button', { name: 'Войти', exact: true }).click()
await page.getByRole('link', { name: /^Сообщения/ }).waitFor({ timeout: 20_000 })
await page.goto(`${ORIGIN}/coach/chat/${CLIENT_ID}`)
await page.locator('.chat-day').first().waitFor({ timeout: 15_000 })
console.log(`Чат открыт: ${ORIGIN}/coach/chat/${CLIENT_ID} — смотрите плашки дат. Закройте окно, чтобы выйти.`)

browser.on('disconnected', () => {
  server.stop()
  process.exit(0)
})
