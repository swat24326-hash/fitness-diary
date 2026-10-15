/**
 * Живой просмотр ДЗ на тестовых данных, без входа на прод: два окна на общих данных.
 * Планшет тренера — карточка клиентки → ДЗ → «Авто»; телефон клиентки — /me, где уже лежит ДЗ «прошлого воскресенья».
 * Отправили «В приложение» на планшете → на телефоне обновить страницу. Правки кода видны сразу (Vite). Закрыть окна — выход.
 * Запуск: node scripts/e2e/preview-trainer-homework.mjs
 */
import { chromium } from 'playwright'
import { createFakeBackend } from './lib/fakeBackend.mjs'
import { createFakeClientPortal } from './lib/fakeClientPortal.mjs'
import { ORIGIN, loginUi, newE2eContext, startDevServer } from './lib/e2eHarness.mjs'
import { CLIENT_ID, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, weightHistorySeed } from './lib/fixtures.mjs'
import { tapSync } from './lib/trainerSteps.mjs'
import {
  addDaysIso,
  buildHomeworkAutoPlan,
  homeworkAutoRowId,
  homeworkAutoUpcomingSunday,
} from '../../src/lib/homework/auto/homeworkAutoScheduleCore.js'

const INVITE = 'preview-invite'
const backend = createFakeBackend(weightHistorySeed())
const lastSunday = addDaysIso(homeworkAutoUpcomingSunday(), -7)
const sample = buildHomeworkAutoPlan({
  row: {
    id: homeworkAutoRowId(CLIENT_ID),
    client_id: CLIENT_ID,
    club_id: CLUB_ID,
    enabled: true,
    goal: 'tone',
    level: 1,
    avoid: [],
    sessions: 2,
    sex: 'female',
    limits_ok: true,
    anchor_date: lastSunday,
    block_shift: 0,
    updated_by: TRAINER_ID,
  },
  client: { id: CLIENT_ID, trainer_id: TRAINER_ID, club_id: CLUB_ID },
  sundayIso: lastSunday,
  now: new Date(`${lastSunday}T07:00:00.000Z`),
})
if (sample.ok) backend.state.client_plans = [sample.plan]

backend.clientMe = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: INVITE, today: isoDay(0) })

const server = await startDevServer()
const browser = await chromium.launch({ headless: false, args: ['--window-position=0,0'] })

const tablet = await newE2eContext(browser, backend, { viewport: { width: 1180, height: 820 }, hasTouch: true })
const trainer = await tablet.newPage()
await loginUi(trainer, TRAINER_LOGIN, TRAINER_PASSWORD)
await tapSync(trainer)
await trainer.goto(`${ORIGIN}/trainer/clients/${CLIENT_ID}?tab=homework`, { waitUntil: 'domcontentloaded' })
await trainer.getByRole('tab', { name: 'Авто' }).click().catch(() => null)

const phone = await newE2eContext(browser, backend, {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
})
const client = await phone.newPage()
await client.goto(`${ORIGIN}/me/join#t=${INVITE}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
await client.waitForURL(`${ORIGIN}/me/`, { timeout: 60_000 }).catch(() => null)

console.log(`Планшет тренера: ${ORIGIN}/trainer/clients/${CLIENT_ID}?tab=homework (вкладка «Авто»)`)
console.log(`Телефон клиентки: ${ORIGIN}/me — ДЗ от ${lastSunday.split('-').reverse().slice(0, 2).join('.')}`)
console.log('Тестовые данные, прод не трогается. Закройте окна, чтобы выйти.')

browser.on('disconnected', () => {
  server.stop()
  process.exit(0)
})
