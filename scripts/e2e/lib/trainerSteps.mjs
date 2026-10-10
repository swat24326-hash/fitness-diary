/** Шаги тренера на планшете — общие для сценариев. */
import { createFakeBackend } from './fakeBackend.mjs'
import { ORIGIN, loginUi, newE2eContext } from './e2eHarness.mjs'
import { TRAINER_LOGIN, TRAINER_PASSWORD } from './fixtures.mjs'

/** Вход тренера + первый Sync: клиенты, абонементы и справочник на планшете. */
export async function openTrainerSession(browser, seed, contextOpts = {}) {
  const backend = createFakeBackend(seed)
  const context = await newE2eContext(browser, backend, contextOpts)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  page.on('dialog', (d) => void d.accept())
  await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
  await tapSync(page)
  return { backend, context, page, pageErrors }
}

/** Подпись Sync в шапке обновляется с задержкой — ждём совпадения, возвращаем итог. */
export async function waitSyncLabel(page, re, timeoutMs = 10_000) {
  const btn = page.locator(SYNC_BTN).first()
  const until = Date.now() + timeoutMs
  let label = ''
  while (Date.now() < until) {
    label = (await btn.getAttribute('aria-label')) ?? ''
    if (re.test(label)) return true
    await page.waitForTimeout(250)
  }
  console.log(`    подпись Sync: «${label}»`)
  return false
}

const SYNC_BTN = '.app-header__sync-wrap button'

/** Тап по Sync в шапке и ожидание конца (flush → pull). */
export async function tapSync(page) {
  const btn = page.locator(SYNC_BTN).first()
  await btn.waitFor({ state: 'visible', timeout: 15_000 })
  await btn.click()
  await page.waitForFunction(
    (sel) => {
      const b = globalThis.document.querySelector(sel)
      return b && b.getAttribute('aria-busy') !== 'true' && !b.disabled
    },
    SYNC_BTN,
    { timeout: 60_000 },
  )
}

export async function openClientCard(page, clientId) {
  await page.goto(`${ORIGIN}/trainer/clients/${clientId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.trainer-path-head__actions').waitFor({ timeout: 20_000 })
}

export async function startNewTraining(page) {
  await page.locator('.trainer-path-head__actions a[aria-label="Новая тренировка"]').click()
  await page.waitForURL(/\/trainer\/workouts\/[0-9a-f-]{36}/, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Закончить тренировку' }).waitFor({ timeout: 20_000 })
}
