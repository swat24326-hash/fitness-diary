/**
 * Центр сбоев устройств: у тренера загрузка данных падает (502) больше 30 минут — в шапке появляется «Помощь»
 * с понятным шагом, планшет сам сообщает серверу; данные снова грузятся — иконка уходит.
 * Админ: иконка «Сбои устройств» с числом, карточка «что сказать тренеру», «Решено»; старая «Структура → Диагностика» ведёт сюда.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, trainerClubSeed } from '../lib/fixtures.mjs'
import { tapSync } from '../lib/trainerSteps.mjs'

export const name = 'центр сбоев устройств'

const ADMIN_LOGIN = 'e2e_admin_health'
const ADMIN_PASSWORD = randomUUID()
const PULL_MARK = 'fd-device-health-pull'

async function until(fn, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return fn()
}

/** Отчёт планшета — сразу, без ожидания таймера (как при возврате сети). */
const nudgeReporter = (page) => page.evaluate(() => globalThis.dispatchEvent(new Event('online')))

async function trainerSide(browser, c) {
  const backend = createFakeBackend(trainerClubSeed())
  const reports = []
  backend.adminData = (req) => {
    if (req.searchParams.get('action') !== 'device-health' || req.method !== 'POST') return null
    reports.push({ problems: req.body?.problems ?? [], deviceId: req.headers['x-device-id'] ?? '' })
    return { status: 200, json: { ok: true } }
  }
  backend.pullFails = true
  const context = await newE2eContext(browser, backend)
  await context.addInitScript(
    ([key, mark]) => {
      if (!globalThis.localStorage.getItem(key)) globalThis.localStorage.setItem(key, JSON.stringify(mark))
    },
    [PULL_MARK, { okAt: null, failSince: Date.now() - 40 * 60_000, failCount: 2 }],
  )
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    const help = page.getByTestId('header-help')
    const shown = await until(async () => {
      await nudgeReporter(page)
      return help.isVisible()
    }, 15_000)
    c.ok(shown, 'загрузка падает 40 мин — в шапке тренера «Помощь»')
    c.ok(
      reports.some((r) => r.problems.includes('pull_failing') && r.deviceId.length >= 16),
      'планшет сам сообщил серверу о сбое (с номером устройства)',
    )
    if (shown) {
      await help.click()
      const hint = page.getByTestId('device-problems-hint')
      c.ok(await hint.isVisible(), '«Помощь» открывается с подсказкой, что не так')
      c.ok((await hint.innerText()).includes('Sync'), 'в подсказке — что сделать (Sync)')
      await screenshot(page, 'device-health-trainer-help')
      await page.keyboard.press('Escape')
    }

    backend.pullFails = false
    await tapSync(page)
    const hidden = await until(async () => {
      await nudgeReporter(page)
      return !(await help.isVisible())
    }, 15_000)
    c.ok(hidden, 'данные загрузились — «Помощь» из шапки ушла')
    const cleared = await until(async () => {
      if (reports.at(-1)?.problems.length === 0) return true
      await nudgeReporter(page)
      return false
    }, 10_000)
    c.ok(cleared, 'планшет сообщил: всё в порядке')
  } catch (e) {
    await screenshot(page, 'device-health-trainer-FAIL').catch(() => null)
    c.ok(false, `сбои (тренер): сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

function adminSeed() {
  const s = trainerClubSeed()
  s.users.push({
    id: 'e2e00000-0000-4000-8000-0000000000a8',
    login: ADMIN_LOGIN,
    email: `${ADMIN_LOGIN}@trainer.local`,
    password: ADMIN_PASSWORD,
    role: 'admin',
    name: 'Админ Сети',
    club_id: CLUB_ID,
  })
  return s
}

async function adminSide(browser, c) {
  const backend = createFakeBackend(adminSeed())
  const device = {
    id: 'dh-1',
    user_id: TRAINER_ID,
    trainer_name: 'Тренер Тестов',
    club_name: 'Клуб E2E',
    label: 'Android · Chrome',
    codes: ['db_blocked'],
    critical: true,
    needs_attention: true,
    problem_since: new Date(Date.now() - 20 * 60_000).toISOString(),
    last_report_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    queue_count: 3,
    instruction: 'Закройте приложение на всех вкладках и перезагрузите планшет (выключить и включить). Данные на планшете не пропадут.',
  }
  backend.adminData = (req) => {
    const action = req.searchParams.get('action')
    if (action === 'device-health' && req.method === 'GET') {
      return { status: 200, json: { devices: [device], attention: device.needs_attention ? 1 : 0 } }
    }
    if (action === 'device-health-resolve' && req.method === 'POST') {
      if (req.body?.id === device.id) Object.assign(device, { needs_attention: false })
      return { status: 200, json: { ok: true } }
    }
    return null
  }
  const context = await newE2eContext(browser, backend, { viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await loginUi(page, ADMIN_LOGIN, ADMIN_PASSWORD)
    const icon = page.getByTestId('header-device-health')
    await icon.waitFor({ timeout: 15_000 })
    c.ok(await until(async () => (await icon.innerText()).trim() === '1'), 'шапка админа: «Сбои устройств» с числом 1')
    await icon.click()
    await page.waitForURL((u) => u.pathname === '/admin/health', { timeout: 10_000 })
    const card = page.getByTestId('device-health-card')
    await card.waitFor({ timeout: 10_000 })
    c.ok((await card.innerText()).includes('Скажите тренеру'), 'карточка: что сказать тренеру')
    const href = await card.getByRole('link', { name: /Написать тренеру/ }).getAttribute('href')
    c.ok(String(href).startsWith(`/messages?dm=${TRAINER_ID}&text=`), '«Написать тренеру» — чат с тренером и готовым текстом')
    await screenshot(page, 'device-health-admin')

    await card.getByRole('button', { name: /Решено/ }).click()
    c.ok(
      await page.getByTestId('device-health-ok').waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
      '«Решено» — карточка ушла, «Все планшеты в порядке»',
    )
    c.ok(await until(async () => (await icon.innerText()).trim() === ''), 'число в шапке пропало')

    await page.goto(`${ORIGIN}/admin/structure?tab=diagnostics&club=${CLUB_ID}`)
    await page.waitForURL((u) => u.pathname === '/admin/health', { timeout: 10_000 })
    c.ok(new URL(page.url()).searchParams.get('club') === CLUB_ID, 'старая «Структура → Диагностика» ведёт в центр сбоев')
    c.ok((await page.getByRole('tab', { name: 'Диагностика' }).count()) === 0, 'вкладки «Диагностика» в «Структуре» больше нет')
  } catch (e) {
    await screenshot(page, 'device-health-admin-FAIL').catch(() => null)
    c.ok(false, `сбои (админ): сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('device-health')
  await trainerSide(browser, c)
  await adminSide(browser, c)
  return c.failures
}
