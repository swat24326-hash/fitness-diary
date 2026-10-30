/**
 * Клиент /me: свой вес ○ — добавить через меню ⋮ → шторку; клубная ● не в форме правки.
 * DEV home-preview: смешанные ●/○ и пункты меню.
 */

async function openAddFromMenu(page, label) {
  await page.getByRole('button', { name: 'Меню' }).click()
  await page.getByRole('button', { name: label }).click()
}
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, TRAINER_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'

export const name = 'клиент прогресс: свой вес и обмеры'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const INVITE = 'e2e-progress-self-invite'

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
  const c = createChecks('client-progress-self')
  const today = isoDay(0)
  const backend = createFakeBackend(completedTodaySeed())
  backend.state.client_weight_entries = [
    {
      id: 'e2e-w-club',
      client_id: CLIENT_ID,
      date: isoDay(-20),
      weight_kg: 72,
      source: 'manual',
    },
    {
      id: 'e2e-w-train',
      client_id: CLIENT_ID,
      date: isoDay(-5),
      weight_kg: 71,
      source: 'training',
    },
  ]
  backend.state.trainings = (backend.state.trainings ?? []).map((t) =>
    t.client_id === CLIENT_ID && t.status === 'completed'
      ? { ...t, data: { ...(typeof t.data === 'object' ? t.data : {}), pre_weight_kg: 70.5 } }
      : t,
  )
  backend.clientMe = createFakeClientPortal(backend.state, {
    clientId: CLIENT_ID,
    inviteToken: INVITE,
    today,
    schedule: [{ day_date: isoDay(2), start_minutes: 600, duration_minutes: 60, trainer_id: TRAINER_ID }],
  })

  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))

  try {
    /* DEV-превью: ● и ○ + шторка локально */
    await page.goto(`${ORIGIN}/me/home-preview`)
    c.ok(await visible(page, 'Мой прогресс'), 'превью: блок прогресса')
    c.ok(await visible(page, 'Меню'), 'превью: меню ⋮')
    const selfDots = page.locator('.client-me-spark__dot--self')
    c.ok((await selfDots.count()) >= 1, 'превью: есть ○ на графике')
    await openAddFromMenu(page, 'Добавить вес')
    c.ok(await visible(page, '● от клуба'), 'шторка: легенда клуб')
    c.ok(await visible(page, '○ вы внесли'), 'шторка: легенда я')
    await page.getByRole('button', { name: 'Закрыть' }).first().click()
    await screenshot(page, 'client-progress-self-preview')

    /* Живой /me через invite */
    await page.goto('about:blank')
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    c.ok(await visible(page, 'Мой прогресс'), 'после входа — прогресс')
    const menuBtn = page.getByRole('button', { name: 'Меню' })
    c.ok(
      await menuBtn.waitFor({ state: 'visible', timeout: 10_000 }).then(
        () => true,
        () => false,
      ),
      'после входа — меню',
    )
    await openAddFromMenu(page, 'Добавить вес')
    const dialog = page.getByRole('dialog', { name: 'Добавить вес' })
    /* Дата без клубного веса — иначе в тот же день ● перекрывает ○. */
    const selfDay = isoDay(-2)
    await dialog.getByLabel('Дата').fill(selfDay)
    await dialog.getByLabel('Вес, кг').fill('68,2')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    const saved = (backend.state.client_weight_entries ?? []).find(
      (w) => w.client_id === CLIENT_ID && w.source === 'client' && Number(w.weight_kg) === 68.2 && w.date === selfDay,
    )
    c.ok(Boolean(saved), 'на сервере строка source=client')
    const selfDotOk = await page
      .locator('.client-me-spark__dot--self')
      .first()
      .waitFor({ state: 'attached', timeout: 8_000 })
      .then(
        () => true,
        () => false,
      )
    c.ok(selfDotOk, 'на графике появилась ○')
    /* Легенда ●/○ — только в шторке (не под графиком). */
    await openAddFromMenu(page, 'Добавить вес')
    c.ok(await visible(page, '○ вы внесли'), 'легенда ○ в шторке веса')
    await page.getByRole('button', { name: 'Закрыть' }).first().click()

    await openAddFromMenu(page, 'Добавить обмеры')
    const mDialog = page.getByRole('dialog', { name: 'Добавить обмеры' })
    await mDialog.getByLabel('Шея, см').fill('36')
    await mDialog.getByRole('button', { name: 'Сохранить' }).click()
    const mSaved = (backend.state.body_measurements ?? []).find(
      (m) => m.client_id === CLIENT_ID && m.source === 'client' && Number(m.neck) === 36,
    )
    c.ok(Boolean(mSaved), 'обмеры: строка source=client на сервере')
    c.ok(await visible(page, 'Изменить обмеры'), 'свои обмеры можно открыть на правку')

    c.ok(pageErrors.length === 0, `без ошибок JS (${pageErrors.slice(0, 2).join('; ') || 'нет'})`)
    await screenshot(page, 'client-progress-self-saved')
  } catch (e) {
    await screenshot(page, 'client-progress-self-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
