/**
 * Ежедневник на планшете: повтор записи, перенос пальцем (долгое нажатие), «Отменить»,
 * запрет переноса слота с завершённой тренировкой, линия «сейчас».
 * Ждём: копии и перенос уходят на сервер через очередь, обычный тап по-прежнему открывает форму.
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { ORIGIN, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, DONE_TODAY_ID, TRAINER_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'
import { openTrainerSession } from '../lib/trainerSteps.mjs'
import { scheduleHeadsLayout } from '../lib/scheduleLayout.mjs'

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

/** Режим — через «⋮» справа в шапке календаря, как на телефоне. */
async function pickView(page, name) {
  await page.getByRole('button', { name: /^Режим календаря/ }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
}

/** «+» в правом нижнем углу сетки и не заезжает на легенду цветов под ней. */
function addIsFabAboveLegend(page) {
  return page.evaluate(() => {
    const d = globalThis.document
    const add = d.querySelector('.trainer-schedule-day__add')
    const body = d.querySelector('.trainer-schedule-day__body')?.getBoundingClientRect()
    const legend = d.querySelector('.trainer-schedule-legend')?.getBoundingClientRect()
    if (!add || !body || add.closest('.trainer-schedule-day__head')) return false
    const b = add.getBoundingClientRect()
    return b.width <= 40 && body.right - b.right <= 20 && body.bottom - b.bottom <= 20 && (!legend || b.bottom <= legend.top)
  })
}

/** @param {string} iso @param {number} days */
function addIso(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Частый опрос страницы: нужно поймать момент между двумя перелистываниями у края. */
async function pollPage(fn, timeoutMs, stepMs = 40) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return fn()
}

/** Только текущий экран ленты: соседние недели нарисованы за краем и тоже содержат записи. */
function entryAt(page, hhmm) {
  return page
    .locator(`.trainer-schedule-day__page:not([aria-hidden]) .trainer-schedule-day__entry[aria-label^="${hhmm}"]`)
    .first()
}

function boardState(page) {
  return page.evaluate(() => {
    const d = globalThis.document
    const board = d.querySelector('.trainer-schedule-day__board')
    const viewport = board?.querySelector('.trainer-schedule-day__viewport')?.getBoundingClientRect()
    const days = [...d.querySelectorAll('.trainer-schedule-day__board .trainer-schedule-day__page:not([aria-hidden]) [data-schedule-day]')].map(
      (t) => t.getAttribute('data-schedule-day'),
    )
    const nextPage = board?.querySelectorAll('.trainer-schedule-day__page')[2]?.getBoundingClientRect()
    return {
      scrollTop: board?.scrollTop ?? -1,
      days,
      viewport: viewport ? { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom } : null,
      nextPageLeft: nextPage?.left ?? Infinity,
    }
  })
}

/** Взмах пальцем вбок по сетке; mid — проверка, пока палец ещё на экране. */
async function swipeBoard(cdp, page, dx, mid) {
  const b = await page.locator('.trainer-schedule-day__board').boundingBox()
  const y = b.y + b.height / 2
  const x0 = b.x + b.width / 2 - dx / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 10, y }] })
    await page.waitForTimeout(16)
  }
  if (mid) await mid()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(450)
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
    c.ok((await page.getByRole('tab', { name: 'Неделя', exact: true }).count()) === 0, 'вкладок режимов нет — как на телефоне, режим в «⋮»')
    await page.locator('.trainer-schedule-month').waitFor({ timeout: 15_000 })
    c.ok((await page.getByRole('button', { name: /выбрать месяц$/ }).count()) === 1, 'месяц: заголовок — кнопка выбора месяца')
    await pickView(page, 'День')
    await page.locator('.trainer-schedule-day__board').waitFor({ timeout: 15_000 })

    c.ok((await page.locator('.trainer-schedule-day__now').count()) === 1, 'линия «сейчас» есть в сегодняшнем дне')
    await page.getByRole('button', { name: /^Режим календаря/ }).click()
    c.ok(await page.getByRole('menuitem', { name: 'Сегодня' }).isVisible(), '«Сегодня» — в меню «⋮»')
    await screenshot(page, 'schedule-view-menu')
    await page.keyboard.press('Escape')
    c.ok(await addIsFabAboveLegend(page), '«+» — маленькая кнопка в правом нижнем углу сетки, легенду не закрывает')
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

    /* Короткий тап по записи — просмотр, как в Google Календаре (жест переноса его не съедает); карандаш — форма. */
    await scrollBoardTo(page, 9 * 60)
    await entryAt(page, '10:00').click()
    const view = page.getByRole('dialog')
    c.ok(await view.isVisible(), 'тап по записи открывает окно')
    c.ok((await view.getByRole('button', { name: 'Сохранить' }).count()) === 0, 'тап по записи — просмотр, не форма правки')
    c.ok(await view.getByText(CLIENT_NAME).isVisible(), 'просмотр: видно, кто записан')
    c.ok(await view.getByRole('button', { name: /Начать тренировку|Продолжить/ }).isVisible(), 'просмотр: «Начать тренировку» прямо отсюда')
    await screenshot(page, 'schedule-entry-view')
    await view.getByRole('button', { name: 'Изменить' }).click()
    c.ok(await view.getByRole('button', { name: 'Сохранить' }).isVisible(), 'карандаш «Изменить» открывает форму правки')
    await view.getByRole('button', { name: 'Отмена' }).click()

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

    await pickView(page, 'Неделя')
    await page.locator('.trainer-schedule-day--week').waitFor({ timeout: 10_000 })
    c.ok((await page.locator('.trainer-schedule-day__now').count()) === 1, 'неделя: линия «сейчас» только в одной колонке')
    const heads = await scheduleHeadsLayout(page)
    c.ok(heads.clipped <= 1 && heads.height >= 28, `неделя: шапка дней не обрезана по высоте (${heads.height}px)`)
    c.ok(heads.drift <= 1, `неделя: колонки шапки ровно над колонками сетки (сдвиг ${heads.drift}px)`)
    await scrollBoardTo(page, 9 * 60)
    await screenshot(page, 'schedule-week')

    /* Листание недели пальцем: стрелок нет, соседняя неделя въезжает за пальцем, вертикаль не прыгает. */
    c.ok((await page.getByRole('button', { name: 'Вперёд' }).count()) === 0, 'планшет: стрелок нет — листаем пальцем')
    const week0 = await boardState(page)
    let nextVisibleMid = false
    await swipeBoard(cdp, page, -260, async () => {
      const s = await boardState(page)
      nextVisibleMid = s.nextPageLeft < s.viewport.right - 100
      await screenshot(page, 'schedule-swipe-mid')
    })
    const week1 = await boardState(page)
    c.ok(nextVisibleMid, 'во время взмаха следующая неделя уже видна у края, а не пустота')
    c.ok(week1.days[0] === isoDay(7 - week0.days.indexOf(today)), `взмах влево — следующая неделя (${week1.days[0]})`)
    c.ok(Math.abs(week1.scrollTop - week0.scrollTop) <= 1, `вертикаль не сбросилась при листании (${week0.scrollTop} → ${week1.scrollTop})`)
    await swipeBoard(cdp, page, 260)
    c.ok((await boardState(page)).days[0] === week0.days[0], 'взмах вправо — обратно на текущую неделю')

    /* Перенос через край: держим запись у правого края — листается неделя за неделей, уносим на 2 недели. */
    await scrollBoardTo(page, 9 * 60)
    const weekStart = (await boardState(page)).days[0]
    const moving = (state.trainer_schedule_entries ?? []).find((r) => r.day_date === today && r.start_minutes === 600)
    const grab = await center(entryAt(page, '10:00'))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: grab.x, y: grab.y }] })
    await page.waitForTimeout(650)
    const vp = (await boardState(page)).viewport
    const edgeX = vp.right - 6
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: grab.x + ((edgeX - grab.x) * i) / 8, y: grab.y }] })
      await page.waitForTimeout(16)
    }
    const flippedTwice = await pollPage(async () => (await boardState(page)).days[0] === addIso(weekStart, 14), 5000)
    const colW = (vp.right - vp.left) / 7
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vp.right - colW * 1.5, y: grab.y }] })
    await page.waitForTimeout(700)
    const landed = await boardState(page)
    const ghostDay = await page.evaluate(
      () => globalThis.document.querySelector('.trainer-schedule-day__entry-wrap--ghost')?.closest('[data-schedule-day]')?.getAttribute('data-schedule-day') ?? '',
    )
    await screenshot(page, 'schedule-drag-edge')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    c.ok(flippedTwice && landed.days[0] === addIso(weekStart, 14), `у края неделя пролисталась дважды (${landed.days[0]})`)
    c.ok(ghostDay === landed.days[5], `«призрак» записи в субботе через 2 недели (${ghostDay})`)
    const edgeMoved = await waitFor(
      () => (state.trainer_schedule_entries ?? []).some((r) => r.id === moving?.id && r.day_date === landed.days[5] && r.start_minutes === 600),
      10_000,
    )
    c.ok(edgeMoved, `сервер: запись перенесена на ${landed.days[5]} 10:00`)
    c.ok(!(await page.getByRole('dialog').isVisible()), 'после переноса через край форма не открылась')

    /* Масштаб: «+» в «⋮», щипок двумя пальцами, запоминается после перезагрузки, тап по % — сброс. */
    const hourPx = () =>
      page.evaluate(() => globalThis.document.querySelector('.trainer-schedule-day__hour-label')?.getBoundingClientRect().height ?? 0)
    c.ok(Math.round(await hourPx()) === 84, `масштаб по умолчанию: час 84px (${await hourPx()})`)
    await page.getByRole('button', { name: /^Режим календаря/ }).click()
    await page.getByRole('button', { name: /^Крупнее/ }).click()
    c.ok(Math.round(await hourPx()) === 120, `«Крупнее» в «⋮»: час 120px (${await hourPx()})`)
    c.ok(await page.getByRole('button', { name: /^Масштаб 143%/ }).isVisible(), 'меню не закрылось, видно «143%»')
    await screenshot(page, 'schedule-zoom-menu')
    await page.getByRole('button', { name: /^Масштаб 143%/ }).click()
    c.ok(Math.round(await hourPx()) === 84, `тап по % — обычный масштаб (${await hourPx()})`)
    await page.keyboard.press('Escape')

    const boardBox = await page.locator('.trainer-schedule-day__board').boundingBox()
    const cx = boardBox.x + boardBox.width / 2
    const cy = boardBox.y + boardBox.height / 2
    const pinchAt = (half) => [
      { x: cx, y: cy - half, id: 1 },
      { x: cx, y: cy + half, id: 2 },
    ]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pinchAt(100) })
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pinchAt(100 - i * 5) })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(100)
    const pinched = await hourPx()
    c.ok(Math.round(pinched) === 42, `щипок (пальцы свели вдвое): час 42px — больше часов на экране (${pinched})`)
    const pageScale = await page.evaluate(() => globalThis.visualViewport?.scale ?? 1)
    c.ok(pageScale === 1, `щипок по сетке не зумит всю страницу (scale ${pageScale})`)
    await screenshot(page, 'schedule-zoom-pinch')
    const labelsFit = () =>
      page.evaluate(() => {
        const els = [...globalThis.document.querySelectorAll('.trainer-schedule-day__page:not([aria-hidden]) .trainer-schedule-day__entry')]
        const clipped = els.filter((el) => {
          const l = el.querySelector('.trainer-schedule-day__entry-label')?.getBoundingClientRect()
          const box = el.getBoundingClientRect()
          return !l || l.height === 0 || l.bottom > box.bottom + 1
        }).length
        return { total: els.length, clipped }
      })
    const weekLabels = await labelsFit()
    c.ok(weekLabels.total > 0 && weekLabels.clipped === 0, `мелкий масштаб, неделя: имя видно в каждой записи (${JSON.stringify(weekLabels)})`)
    await page.getByRole('button', { name: /^Режим календаря/ }).click()
    await page.getByRole('menuitem', { name: 'Сегодня' }).click()
    await pickView(page, 'День')
    await page.locator('.trainer-schedule-day__board').waitFor({ timeout: 10_000 })
    const dayLabels = await labelsFit()
    await screenshot(page, 'schedule-zoom-day-small')
    c.ok(dayLabels.total > 0 && dayLabels.clipped === 0, `мелкий масштаб, день: имя видно, не только время (${JSON.stringify(dayLabels)})`)
    await pickView(page, 'Неделя')
    await page.locator('.trainer-schedule-day--week').waitFor({ timeout: 10_000 })

    await page.waitForTimeout(500)
    await page.reload({ waitUntil: 'domcontentloaded' })
    const weekRestored = await page
      .locator('.trainer-schedule-day--week')
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    c.ok(weekRestored, 'вид «Неделя» запомнился после перезагрузки — не сбросился на месяц')
    c.ok(Math.round(await hourPx()) === 42, `масштаб запомнился после перезагрузки (${await hourPx()})`)

    /* Приложение планшета, открытое на телефоне: «⋮» в одной строке с датой, не уезжает вниз. */
    await page.setViewportSize({ width: 360, height: 740 })
    await pickView(page, 'Неделя')
    await page.locator('.trainer-schedule-day--week').waitFor({ timeout: 10_000 })
    const headRow = await page.evaluate(() => {
      const d = globalThis.document
      const t = d.querySelector('.trainer-schedule-day__title')?.getBoundingClientRect()
      const m = d.querySelector('.trainer-schedule-day__head .trainer-schedule-view-menu__toggle')?.getBoundingClientRect()
      return t && m ? { dy: Math.abs(t.top + t.height / 2 - (m.top + m.height / 2)), right: m.right, vw: globalThis.innerWidth } : null
    })
    c.ok(
      headRow && headRow.dy < 8 && headRow.right <= headRow.vw,
      `телефон 360px: «⋮» в одной строке с датой (${JSON.stringify(headRow)})`,
    )
    const clippedDates = await page.evaluate(
      () =>
        [...globalThis.document.querySelectorAll('.trainer-schedule-day__col-heads .trainer-schedule-day__page:not([aria-hidden]) .trainer-schedule-day__col-date')].filter(
          (el) => el.scrollWidth > el.parentElement.clientWidth + 1,
        ).length,
    )
    c.ok(clippedDates === 0, `телефон 360px: даты в шапке недели не обрезаны (обрезано: ${clippedDates})`)
    await screenshot(page, 'schedule-phone-narrow')

    c.ok(pageErrors.length === 0, `без ошибок JS на странице${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'trainer-schedule-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
