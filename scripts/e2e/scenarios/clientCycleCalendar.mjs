/**
 * Клиент /me: тап «Следующая тренировка» → календарь; меню → параметры цикла (DEV-превью).
 */

import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { completedTodaySeed } from '../lib/fixtures.mjs'

export const name = 'клиент календарь и цикл'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}

function visible(page, text) {
  return page
    .getByText(text)
    .first()
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false,
    )
}

export async function run(browser) {
  const c = createChecks('client-cycle-calendar')
  const backend = createFakeBackend(completedTodaySeed())
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))

  try {
    await page.goto(`${ORIGIN}/me/home-preview`)
    c.ok(await visible(page, 'Следующая тренировка'), 'превью: плитка следующей')

    await page.getByRole('button', { name: 'Открыть календарь тренировок' }).click()
    c.ok(await visible(page, 'Календарь'), 'шторка календаря')
    c.ok(await page.locator('.client-cycle-cal__grid').count().then((n) => n > 0), 'сетка месяца')
    c.ok(await visible(page, 'месячные'), 'легенда фаз цикла')
    await screenshot(page, 'client-cycle-calendar-open')

    const cell = page.locator('.client-cycle-cal__cell:not(.client-cycle-cal__cell--empty)').first()
    await cell.click()
    c.ok(await page.locator('.client-cycle-cal__detail strong').count().then((n) => n > 0), 'детали дня')

    await page.locator('.client-cycle-cal .client-progress-self__close').click()
    await page.getByRole('button', { name: 'Меню' }).click()
    await page.getByRole('button', { name: 'Параметры цикла' }).click()
    c.ok(await visible(page, 'Длина цикла'), 'шторка параметров цикла')
    await screenshot(page, 'client-cycle-settings')

    c.ok(pageErrors.length === 0, `без JS-ошибок (${pageErrors[0] || ''})`)
  } catch (e) {
    await screenshot(page, 'client-cycle-calendar-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
