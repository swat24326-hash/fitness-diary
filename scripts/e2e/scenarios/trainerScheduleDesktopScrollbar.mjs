/**
 * Ежедневник с мышью (Windows): полоса прокрутки сетки занимает ~15px и сужает колонки часов.
 * Ждём: шапка «Пн 12.10 … Вс 18.10» сужается на столько же — каждый день ровно над своей колонкой.
 * Свой браузер: общий headless прячет полосы (--hide-scrollbars), и баг не воспроизводится.
 */
import { chromium } from 'playwright'
import { createChecks } from '../lib/e2eChecks.mjs'
import { ORIGIN, screenshot } from '../lib/e2eHarness.mjs'
import { completedTodaySeed } from '../lib/fixtures.mjs'
import { openTrainerSession } from '../lib/trainerSteps.mjs'
import { scheduleHeadsLayout } from '../lib/scheduleLayout.mjs'

export const name = 'тренер: ежедневник с мышью — шапка над колонками'

export async function run() {
  const c = createChecks('trainer-schedule-desktop')
  const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1', ignoreDefaultArgs: ['--hide-scrollbars'] })
  try {
    const { page, context } = await openTrainerSession(browser, completedTodaySeed(), { viewport: { width: 1280, height: 800 } })
    try {
      await page.goto(`${ORIGIN}/trainer/calendar`, { waitUntil: 'domcontentloaded' })
      await page.locator('.trainer-schedule-month').waitFor({ timeout: 15_000 })
      await page.getByRole('button', { name: /^Режим календаря/ }).click()
      await page.getByRole('menuitemradio', { name: 'Неделя', exact: true }).click()
      await page.locator('.trainer-schedule-day--week').waitFor({ timeout: 10_000 })
      await page.waitForTimeout(300)
      const gutter = await page.evaluate(() => {
        const b = globalThis.document.querySelector('.trainer-schedule-day__board')
        return b.offsetWidth - b.clientWidth
      })
      c.ok(gutter >= 10, `полоса прокрутки сетки занимает место, как у мыши (${gutter}px)`)
      const heads = await scheduleHeadsLayout(page)
      c.ok(heads.drift <= 1, `неделя: колонки шапки ровно над колонками сетки (сдвиг ${heads.drift}px)`)
      c.ok(heads.clipped <= 1 && heads.height >= 28, `неделя: шапка дней не обрезана по высоте (${heads.height}px)`)
      await screenshot(page, 'schedule-week-desktop')
    } catch (e) {
      await screenshot(page, 'trainer-schedule-desktop-FAIL').catch(() => null)
      c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
    } finally {
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return c.failures
}
