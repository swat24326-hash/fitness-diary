/**
 * Ежедневник на планшете: повтор записи, перенос пальцем (долгое нажатие), «Отменить»,
 * запрет переноса слота с завершённой тренировкой, линия «сейчас».
 * Ждём: копии и перенос уходят на сервер через очередь, обычный тап по-прежнему открывает форму.
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { ORIGIN, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, DONE_TODAY_ID, TRAINER_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'
import { openTrainerSession } from '../lib/trainerSteps.mjs'

export const name = 'тренер: ежедневник — повтор, перенос пальцем, сейчас'

const LOCKED_ENTRY_ID = 'e2e00000-0000-4000-8000-0000000005e1'
const PX_PER_MIN = 1.4

function seed() {
  const s = completedTodaySeed()
  const now = new Date().toISOString()
  s.trainer_schedule_entries = [
    {
      id: LOCKED_ENTRY_ID,
      club_id: CLUB_ID,
      trainer_id: TRAINER_ID,
      day_date: isoDay(0),
      start_minutes: 18 * 60,
      duration_minutes: 60,
      title: '',
      client_ids: [CLIENT_ID],
      linked_training_id: DONE_TODAY_ID,
      created_at: now,
      updated_at: now,
    },
  ]
  return s
}

/** Касание через CDP: удержание, затем ведём палец по шагам — как тренер на планшете. */
async function touchDrag(cdp, page, from, to, { holdMs = 650, beforeRelease } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  await page.waitForTimeout(holdMs)
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await page.waitForTimeout(16)
  }
  if (beforeRelease) await beforeRelease()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

async function scrollBoardTo(page, minutes) {
  await page.evaluate(
    ([m, ppm]) => {
      const el = globalThis.document.querySelector('.trainer-schedule-day__board')
      if (el) el.scrollTop = Math.max(0, m * ppm - 40)
    },
    [minutes, PX_PER_MIN],
  )
}

function entryAt(page, hhmm) {
  return page.locator(`.trainer-schedule-day__entry[aria-label^="${hhmm}"]`).first()
}

async function center(locator) {
  const b = await locator.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + Math.min(20, b.height / 2) }
}

export async function run(browser) {
  const c = createChecks('trainer-schedule')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, seed(), { hasTouch: true })
  const { state } = backend
  const today = isoDay(0)
  const rowsAt = (min) => (state.trainer_schedule_entries ?? []).filter((r) => r.start_minutes === min && r.id !== LOCKED_ENTRY_ID)
  try {
    await page.goto(`${ORIGIN}/trainer/calendar`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: 'День', exact: true }).click()
    await page.locator('.trainer-schedule-day__board').waitFor({ timeout: 15_000 })

    c.ok((await page.locator('.trainer-schedule-day__now').count()) === 1, 'линия «сейчас» есть в сегодняшнем дне')
    c.ok(await page.getByRole('button', { name: 'Сегодня', exact: true }).isVisible(), 'кнопка «Сегодня» видна')
    await screenshot(page, 'schedule-day-now')

    /* Повтор: запись на 10:00 у клиентки каждую неделю ×4. */
    await scrollBoardTo(page, 9 * 60)
    await page.locator('.trainer-schedule-day__hour-slot[aria-label$="в 10:00"]').click()
    const dialog = page.getByRole('dialog')
    c.ok(
      (await dialog.getByRole('radio', { name: 'Тренировка' }).getAttribute('aria-checked')) === 'true',
      'новая запись: категория по умолчанию «Тренировка»',
    )
    await dialog.getByLabel(CLIENT_NAME).check()
    await dialog.getByLabel('Повторять каждую неделю').check()
    const summary = (await dialog.locator('.trainer-schedule-repeat__summary').textContent()) ?? ''
    c.ok(/Ещё 3 записи/.test(summary), `итог повтора «Ещё 3 записи…» (видно: ${summary.trim()})`)
    await screenshot(page, 'schedule-repeat-form')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })

    const repeatedOk = await waitFor(() => rowsAt(600).length === 4, 15_000)
    const days = rowsAt(600)
      .map((r) => r.day_date)
      .sort()
      .join(',')
    const expectDays = [0, 7, 14, 21].map((d) => isoDay(d)).join(',')
    c.ok(repeatedOk && days === expectDays, `сервер: 4 записи на 10:00 через неделю (${days || 'нет'})`)
    c.ok(
      await page.getByText(/Добавлено ещё 3 записи/).isVisible(),
      'плашка «Добавлено ещё 3 записи»',
    )

    /* Короткий тап по записи — форма открывается, жест переноса его не съедает. */
    await scrollBoardTo(page, 9 * 60)
    await entryAt(page, '10:00').click()
    c.ok(await page.getByRole('dialog').isVisible(), 'тап по записи открывает форму')
    await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click()

    /* Перенос пальцем: 10:00 → 12:00 сегодня. */
    const cdp = await context.newCDPSession(page)
    await scrollBoardTo(page, 9 * 60)
    const from = await center(entryAt(page, '10:00'))
    let ghostVisible = false
    await touchDrag(cdp, page, from, { x: from.x, y: from.y + 120 * PX_PER_MIN }, {
      beforeRelease: async () => {
        ghostVisible = (await page.locator('.trainer-schedule-day__entry-wrap--ghost').count()) === 1
        await screenshot(page, 'schedule-drag-in-progress')
      },
    })
    c.ok(ghostVisible, 'во время переноса запись видна на новом месте')
    const movedOk = await waitFor(
      () => (state.trainer_schedule_entries ?? []).some((r) => r.day_date === today && r.start_minutes === 720),
      10_000,
    )
    c.ok(movedOk, 'сервер: сегодняшняя запись перенесена на 12:00')
    c.ok(await page.getByText(/Перенесено на .*12:00/).isVisible(), 'плашка «Перенесено на … 12:00»')
    c.ok(!(await page.getByRole('dialog').isVisible()), 'после переноса форма не открылась')
    await screenshot(page, 'schedule-drag-moved')

    await page.getByRole('button', { name: 'Отменить' }).click()
    const undoOk = await waitFor(
      () => (state.trainer_schedule_entries ?? []).some((r) => r.day_date === today && r.start_minutes === 600),
      10_000,
    )
    c.ok(undoOk, 'сервер: «Отменить» вернул запись на 10:00')

    /* Слот с завершённой тренировкой не двигается. */
    await scrollBoardTo(page, 17 * 60)
    const lockedFrom = await center(entryAt(page, '18:00'))
    await touchDrag(cdp, page, lockedFrom, { x: lockedFrom.x, y: lockedFrom.y + 60 * PX_PER_MIN })
    c.ok(
      await page.getByText(/Тренировка по записи завершена/).isVisible(),
      'плашка «Тренировка по записи завершена — запись не переносится»',
    )
    const locked = (state.trainer_schedule_entries ?? []).find((r) => r.id === LOCKED_ENTRY_ID)
    c.ok(locked?.start_minutes === 18 * 60, `завершённый слот остался на 18:00 (${locked?.start_minutes})`)
    c.ok(
      (await page.locator('.trainer-schedule-day__entry-wrap--done').count()) === 1,
      'завершённая тренировка помечена (галочка, бледнее)',
    )

    /* Категория: групповое занятие заметкой — цвет в сетке и kind на сервере. */
    await scrollBoardTo(page, 14 * 60)
    await page.locator('.trainer-schedule-day__hour-slot[aria-label$="в 15:00"]').click()
    const groupDialog = page.getByRole('dialog')
    await groupDialog.getByRole('radio', { name: 'Групповое' }).click()
    await groupDialog.getByRole('tab', { name: 'Заметка' }).click()
    await groupDialog.getByRole('textbox', { name: 'Текст' }).fill('Функционалка')
    await screenshot(page, 'schedule-kind-form')
    await groupDialog.getByRole('button', { name: 'Сохранить' }).click()
    await groupDialog.waitFor({ state: 'hidden', timeout: 10_000 })
    const groupOk = await waitFor(() => rowsAt(900).some((r) => r.kind === 'group'), 10_000)
    c.ok(groupOk, `сервер: запись 15:00 с kind=group (${rowsAt(900).map((r) => r.kind).join(',') || 'нет'})`)
    c.ok(
      (await entryAt(page, '15:00').getAttribute('class'))?.includes('trainer-schedule-kind--group'),
      'сетка: запись 15:00 окрашена как «Групповое»',
    )
    c.ok(await page.locator('.trainer-schedule-legend').isVisible(), 'легенда цветов под сеткой')
    await screenshot(page, 'schedule-kinds-day')

    await page.getByRole('tab', { name: 'Неделя', exact: true }).click()
    await page.locator('.trainer-schedule-day--week').waitFor({ timeout: 10_000 })
    c.ok((await page.locator('.trainer-schedule-day__now').count()) === 1, 'неделя: линия «сейчас» только в одной колонке')
    await scrollBoardTo(page, 9 * 60)
    await screenshot(page, 'schedule-week')

    c.ok(pageErrors.length === 0, `без ошибок JS на странице${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'trainer-schedule-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
