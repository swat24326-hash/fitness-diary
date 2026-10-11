/**
 * Ежедневники тренеров у админа (монитор 1440): та же шапка, что у тренера («⋮» с «Сегодня» и режимами, выбор месяца),
 * тренер — «таблетками» в один клик, в месяце число записей за день, страница на всю ширину, только просмотр.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, TRAINER_ID, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'админ: ежедневники тренеров'

const MONITOR = { viewport: { width: 1440, height: 900 } }
const ADMIN_LOGIN = 'e2e_admin_schedule'
const ADMIN_PASSWORD = randomUUID()
const TRAINER2_ID = 'e2e00000-0000-4000-8000-0000000000a2'

function seed() {
  const s = trainerClubSeed()
  s.users.push(
    { id: TRAINER2_ID, login: 'e2e_trainer2', email: 'e2e_trainer2@trainer.local', password: randomUUID(), role: 'trainer', name: 'Анна Вторая', club_id: CLUB_ID },
    { id: 'e2e00000-0000-4000-8000-0000000000a9', login: ADMIN_LOGIN, email: `${ADMIN_LOGIN}@trainer.local`, password: ADMIN_PASSWORD, role: 'admin', name: 'Админ Сети', club_id: CLUB_ID },
  )
  return s
}

function scheduleApi(state, schedule) {
  return (req) => {
    if (req.searchParams.get('action') !== 'trainer-schedule') return null
    const from = req.searchParams.get('day_from')
    const to = req.searchParams.get('day_to')
    const trainer = req.searchParams.get('trainer_id') ?? ''
    const entries = schedule.filter((e) => e.day_date >= from && e.day_date <= to && (!trainer || e.trainer_id === trainer))
    const trainerNameById = Object.fromEntries(state.users.map((u) => [u.id, u.name]))
    return { status: 200, json: { entries, clientNameById: { [CLIENT_ID]: CLIENT_NAME }, trainerNameById, trainingById: {} } }
  }
}

/** Как waitFor, но условие — запрос к странице (async). */
async function until(fn, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return fn()
}

const todayCount = (page) =>
  page.locator('.trainer-schedule-month__cell--today .trainer-schedule-month__count').innerText().catch(() => '')

export async function run(browser) {
  const c = createChecks('admin-trainer-schedule')
  const backend = createFakeBackend(seed())
  const slot = (id, trainerId, start, title) => ({
    id, club_id: CLUB_ID, trainer_id: trainerId, day_date: isoDay(0), start_minutes: start, duration_minutes: 60, title, client_ids: [], kind: 'training',
  })
  const schedule = [slot('e2e-adm-1', TRAINER_ID, 600, 'Утро'), slot('e2e-adm-2', TRAINER2_ID, 660, 'Группа')]
  backend.adminData = scheduleApi(backend.state, schedule)
  const context = await newE2eContext(browser, backend, MONITOR)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await loginUi(page, ADMIN_LOGIN, ADMIN_PASSWORD)
    await page.goto(`${ORIGIN}/admin/trainer-schedule?club=${CLUB_ID}`)
    await page.locator('.trainer-schedule-month').waitFor({ timeout: 15_000 })

    c.ok((await page.getByRole('tab', { name: 'Неделя', exact: true }).count()) === 0, 'вкладок режимов нет — режим в «⋮», как у тренера')
    const filter = page.getByRole('radiogroup', { name: 'Тренер' })
    c.ok(await until(async () => (await filter.getByRole('radio').count()) === 3, 10_000), 'тренер: «Все тренеры» и два тренера клуба «таблетками»')
    c.ok((await filter.getByRole('radio', { name: 'Все тренеры' }).getAttribute('aria-checked')) === 'true', 'по умолчанию — все тренеры')
    c.ok((await page.locator('.admin-trainer-schedule-page select').count()) === 0, 'выпадающего списка тренеров больше нет')
    c.ok(await until(async () => (await todayCount(page)) === '2', 10_000), 'месяц: в сегодняшней клетке число записей — 2')
    c.ok((await page.getByRole('button', { name: /выбрать месяц$/ }).count()) === 1, 'месяц: заголовок — кнопка выбора месяца')
    const cardWidth = await page.locator('.trainer-schedule-month').evaluate((el) => el.getBoundingClientRect().width)
    c.ok(cardWidth > 1000, `на мониторе календарь на всю ширину (${Math.round(cardWidth)}px)`)
    c.ok(await page.getByText('Только просмотр').isVisible(), '«Только просмотр» — пометка у заголовка')
    await screenshot(page, 'admin-schedule-month')

    await filter.getByRole('radio', { name: 'Тренер Тестов' }).click()
    c.ok(await until(async () => (await todayCount(page)) === '1', 10_000), 'тренер в один клик: в клетке только его запись — 1')
    c.ok(new URL(page.url()).searchParams.get('trainer') === TRAINER_ID, 'выбранный тренер — в адресе (ссылку можно переслать)')
    await filter.getByRole('radio', { name: 'Все тренеры' }).click()

    await page.getByRole('button', { name: /^Режим календаря/ }).click()
    c.ok(await page.getByRole('menuitem', { name: 'Сегодня' }).isVisible(), '«⋮»: «Сегодня» в меню')
    await page.getByRole('menuitemradio', { name: 'День', exact: true }).click()
    await page.locator('.trainer-schedule-day__board').waitFor({ timeout: 10_000 })
    c.ok(await until(async () => (await page.locator('.trainer-schedule-day__entry').count()) === 2, 10_000), 'день: записи обоих тренеров')
    c.ok((await page.getByRole('button', { name: 'Новая запись' }).count()) === 0, 'админ не создаёт записи — «+» нет')
    const centered = await page.evaluate(() => {
      const d = globalThis.document
      const head = d.querySelector('.trainer-schedule-day__head')?.getBoundingClientRect()
      const title = d.querySelector('.trainer-schedule-day__title')?.getBoundingClientRect()
      return Boolean(head && title) && Math.abs(title.left + title.width / 2 - (head.left + head.width / 2)) <= 2
    })
    c.ok(centered, 'день: дата по центру шапки')
    await screenshot(page, 'admin-schedule-day')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'admin-schedule-FAIL').catch(() => null)
    c.ok(false, `ежедневники у админа: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
