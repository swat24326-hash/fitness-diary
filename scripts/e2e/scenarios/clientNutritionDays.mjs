/**
 * Склейка: снимок рациона уже содержит 7 дней, экран клиента должен их переключать.
 * Раньше рисовался только верхний список приёмов — один день без кнопок.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, TRAINER_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'

export const name = 'клиент: рацион на 7 дней'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const INVITE = 'e2e-nutrition-days'
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function meal(slot, food) {
  return {
    label: slot,
    items: [{ label: food, portion: '100 г', grams: 100, kcal: 200, proteinG: 20, fatG: 8, carbsG: 15 }],
    subtotal: { kcal: 200, proteinG: 20, fatG: 8, carbsG: 15 },
  }
}

function reaches(locator) {
  return locator
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

export async function run(browser) {
  const c = createChecks('client-nutrition-days')
  const backend = createFakeBackend(completedTodaySeed())
  backend.state.client_plans = [
    {
      id: 'e2e00000-0000-4000-8000-0000000000d7',
      client_id: CLIENT_ID,
      kind: 'nutrition',
      sent_by: TRAINER_ID,
      sent_at: new Date().toISOString(),
      client_seen_at: null,
      payload: {
        goal: 'Снижение веса',
        kcal_target: 1800,
        totals: { kcal: 1800, proteinG: 120, fatG: 55, carbsG: 170 },
        meals: [meal('Завтрак', 'Овсянка понедельника')],
        days: WEEK.map((label, i) => ({
          label,
          totals: { kcal: 1800 + i, proteinG: 120, fatG: 55, carbsG: 170 },
          meals: [meal(i === 6 ? 'Ужин' : 'Завтрак', i === 0 ? 'Овсянка понедельника' : i === 6 ? 'Рыба воскресенья' : `Блюдо ${label}`)],
        })),
      },
    },
  ]
  backend.clientMe = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: INVITE, today: isoDay(0) })
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/nutrition`)
    c.ok(await reaches(page.getByRole('button', { name: 'Понедельник' })), 'клиент: кнопки дней, понедельник выбран')
    c.ok(await reaches(page.getByText('Овсянка понедельника')), 'клиент: сначала блюда понедельника')
    c.ok(!(await page.getByText('Рыба воскресенья').count()), 'клиент: воскресенье не смешано с понедельником')
    const box = await page.getByRole('button', { name: 'Понедельник' }).boundingBox()
    c.ok(Boolean(box && box.width >= 44 && box.height >= 44), 'кнопка дня не меньше 44×44')
    await screenshot(page, 'client-nutrition-days-mon')
    await page.getByRole('button', { name: 'Воскресенье' }).click()
    c.ok(await reaches(page.getByText('Рыба воскресенья')), 'клиент: воскресенье — другие блюда')
    c.ok(await reaches(page.getByText('1806')), 'клиент: ккал этого дня')
    c.ok(!(await page.getByText('Овсянка понедельника').count()), 'клиент: понедельник скрыт')
    await screenshot(page, 'client-nutrition-days-sun')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'client-nutrition-days-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
