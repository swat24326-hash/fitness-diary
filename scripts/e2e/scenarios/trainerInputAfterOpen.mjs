/**
 * Ввод сразу после открытия новой тренировки (код A, INC-2026-10-11-03). Загруженный планшет —
 * IndexedDB отвечает медленно и неровно:
 * 1) после /new → /:id поздний restore брал durable «только вес» и затирал направленность на экране;
 * 2) ранний автосейв застревал в IDB дольше позднего и записывал старую форму поверх новой
 *    (в дневник и в очередь на сервер);
 * 3) на сервере должна оказаться последняя форма: ack старого push, повторный insert («дубликат»),
 *    копия в localStorage со «свежей» меткой — не перетирают её.
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, PAST_TRAINING_ID, trainerClubSeed } from '../lib/fixtures.mjs'
import { openClientCard, openTrainerSession, startNewTraining } from '../lib/trainerSteps.mjs'

export const name = 'тренер: ввод сразу после открытия тренировки не теряется'

/** `trainings.get` — когда restore/автосейв дочитает строку; `sync_queue.getAll` — проверка «можно ли писать». */
const SLOW_IDB = { 'trainings:get': 1500, 'sync_queue:getAll': 1500 }
const AUTOSAVE_DEBOUNCE_MS = 650

/** Ответы IndexedDB по выбранным store приходят с задержкой (idb ждёт событие success). */
function installSlowIdb() {
  const slow = (proto, method) => {
    const native = proto[method]
    proto[method] = function slowed(...args) {
      const req = native.apply(this, args)
      const store = this.objectStore?.name ?? this.name
      const delay = Number(globalThis.__e2eSlowIdb?.[`${store}:${method}`]) || 0
      if (delay > 0) {
        const add = req.addEventListener.bind(req)
        req.addEventListener = (type, fn, opts) =>
          add(type, type === 'success' ? (e) => setTimeout(() => fn(e), delay) : fn, opts)
      }
      return req
    }
  }
  slow(globalThis.IDBObjectStore.prototype, 'get')
  slow(globalThis.IDBObjectStore.prototype, 'getAll')
  slow(globalThis.IDBIndex.prototype, 'getAll')
}

function setSlowIdb(page, on) {
  return page.evaluate((cfg) => {
    globalThis.__e2eSlowIdb = cfg
  }, on ? SLOW_IDB : null)
}

function focusInput(page) {
  return page.locator('.field', { hasText: 'Направленность тренировки' }).locator('input')
}

function weightInput(page) {
  return page.getByRole('spinbutton', { name: 'Вес до тренировки, кг' })
}

function serverDraft(state) {
  return state.trainings.find((t) => t.client_id === CLIENT_ID && t.id !== PAST_TRAINING_ID)
}

export async function run(browser) {
  const c = createChecks('input-after-open')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, trainerClubSeed())
  const slowestPersistMs = SLOW_IDB['trainings:get'] + SLOW_IDB['sync_queue:getAll']
  try {
    await page.addInitScript(installSlowIdb)
    await openClientCard(page, CLIENT_ID)
    await setSlowIdb(page, true)
    await startNewTraining(page)

    await weightInput(page).fill('62')
    /* Restore уже проверяет «можно ли писать», вес ещё едет в durable — тренер вводит дальше. */
    await page.waitForTimeout(SLOW_IDB['trainings:get'] + 500)
    await focusInput(page).fill('Сила')
    await page.waitForTimeout(slowestPersistMs + 1000)
    const focus = await focusInput(page).inputValue()
    c.ok(focus === 'Сила', `направленность осталась после позднего восстановления (видно: «${focus}»)`)
    const weight = await weightInput(page).inputValue()
    c.ok(weight === '62', `вес на месте (видно: «${weight}»)`)

    /* Автосейв веса стартует при медленной IDB, следующий — уже при быстрой и обгоняет его. */
    await weightInput(page).fill('63')
    await page.waitForTimeout(AUTOSAVE_DEBOUNCE_MS + 150)
    await setSlowIdb(page, false)
    await focusInput(page).fill('Сила и выносливость')
    await page.waitForTimeout(slowestPersistMs + 1500)

    const finalFocus = 'Сила и выносливость'
    const synced = await waitFor(() => {
      const data = serverDraft(backend.state)?.data
      return data?.training_focus === finalFocus && data?.pre_weight_kg === '63'
    }, 15_000)
    const onServer = serverDraft(backend.state)?.data
    c.ok(
      synced,
      `черновик на сервере = последний ввод «${finalFocus}», 63 кг (там: «${onServer?.training_focus ?? '—'}», ${onServer?.pre_weight_kg ?? '—'} кг)`,
    )
    const screenFocus = await focusInput(page).inputValue()
    c.ok(screenFocus === finalFocus, `на экране последний ввод (видно: «${screenFocus}»)`)
    c.ok(pageErrors.length === 0, `без ошибок JS на странице${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'input-after-open-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
