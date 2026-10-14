/**
 * INC-2026-10-14-01: после выкладки с новой версией базы на планшете старая копия приложения
 * (вторая вкладка, окно) держит базу — обновление ждёт, все чтения висели молча («Клуб …», «Загрузка…»).
 * Теперь: баннер с понятным действием; копию закрыли — баннер ушёл, вход и Sync работают.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { loginUi, newE2eContext, ORIGIN, screenshot } from '../lib/e2eHarness.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { TRAINER_LOGIN, TRAINER_PASSWORD, trainerClubSeed } from '../lib/fixtures.mjs'
import { tapSync } from '../lib/trainerSteps.mjs'

export const name = 'база на планшете: старая копия держит обновление'

const BANNER = 'Данные на планшете не открываются'

export async function run(browser) {
  const c = createChecks('local-db-blocked')
  const backend = createFakeBackend(trainerClubSeed())
  const context = await newE2eContext(browser, backend)
  const holder = await context.newPage()
  const page = await context.newPage()
  try {
    await holder.goto(`${ORIGIN}/vite.svg`)
    await holder.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = globalThis.indexedDB.open('fitness-diary', 1)
          req.onsuccess = () => {
            globalThis.__heldDb = req.result
            resolve()
          }
          req.onerror = () => reject(req.error)
        }),
    )

    await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded' })
    const banner = page.getByRole('alert').filter({ hasText: BANNER })
    const shown = await banner
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    c.ok(shown, 'обновление базы ждёт — баннер с действием, а не молчаливое «Загрузка…»')
    if (shown) await screenshot(page, 'local-db-blocked-banner')

    await holder.evaluate(() => globalThis.__heldDb.close())
    const hidden = await banner
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    c.ok(hidden, 'старую копию закрыли — баннер ушёл сам')

    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await tapSync(page)
    const upgraded = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = globalThis.indexedDB.open('fitness-diary')
          req.onsuccess = () => {
            const ok = req.result.objectStoreNames.contains('homework_library')
            req.result.close()
            resolve(ok)
          }
          req.onerror = () => resolve(false)
        }),
    )
    c.ok(upgraded, 'база обновилась до новой версии, вход и Sync прошли')
  } catch (e) {
    await screenshot(page, 'local-db-blocked-FAIL').catch(() => null)
    c.ok(false, `база на планшете: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
