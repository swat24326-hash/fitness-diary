/**
 * Ежедневник на телефоне тренера (/coach/calendar): новая запись с клиентом, перенос пальцем и «Отменить»,
 * правка устаревшей записи (планшет успел раньше) → «обновите», удаление, завершённая тренировка не двигается.
 * Ждём: всё уходит на сервер сразу (без очереди), кнопки «Начать тренировку» на телефоне нет.
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { scheduleHeadsLayout } from '../lib/scheduleLayout.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'телефон тренера: Ежедневник с правкой'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const PX_PER_MIN = 1
const DONE_TRAINING = 'e2e-training-done'
const GROUP = Array.from({ length: 15 }, (_, i) => `Группа Участник ${String(i + 1).padStart(2, '0')}`)

function setup() {
  const seed = trainerClubSeed()
  for (const name of GROUP) {
    seed.clients.push({ ...seed.clients[0], id: `e2e-group-${name.slice(-2)}`, name, phone: null })
  }
  const backend = createFakeBackend(seed)
  const chat = createFakeChat(backend.state)
  const slot = (id, start, extra = {}) => ({
    id, club_id: CLUB_ID, trainer_id: TRAINER_ID, day_date: isoDay(0), start_minutes: start, duration_minutes: 60, title: '', client_ids: [CLIENT_ID], ...extra,
  })
  const schedule = [slot('e2e-phone-10', 600), slot('e2e-phone-locked', 18 * 60, { linked_training_id: DONE_TRAINING })]
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule, trainings: { [DONE_TRAINING]: 'completed' } })
  backend.coach = coach.handle
  return { backend, schedule, coach }
}

async function touchDrag(cdp, page, from, to) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  await page.waitForTimeout(650)
  for (let i = 1; i <= 12; i++) {
    const y = from.y + ((to.y - from.y) * i) / 12
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** Быстрый взмах пальцем вбок по сетке (dx < 0 — влево, вперёд по времени). */
async function touchSwipe(cdp, page, selector, dx) {
  const b = await page.locator(selector).first().boundingBox()
  const x = b.x + b.width / 2 - dx / 2
  const y = b.y + Math.min(b.height / 2, 200)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 6, y }] })
    await page.waitForTimeout(12)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(500)
}

const titleText = (page, cls) => page.locator(cls).first().innerText()

async function scrollBoardTo(page, minutes) {
  await page.evaluate(
    ([m, ppm]) => {
      const el = globalThis.document.querySelector('.trainer-schedule-day__board')
      if (el) el.scrollTop = Math.max(0, m * ppm - 40)
    },
    [minutes, PX_PER_MIN],
  )
}

/** Колонки текущего экрана целиком в видимой полосе ленты, прокрутки вбок нет (соседние экраны — за краем). */
function currentDaysFit(page) {
  return page.evaluate(() => {
    const d = globalThis.document
    const board = d.querySelector('.trainer-schedule-day__board')
    const viewport = board?.querySelector('.trainer-schedule-day__viewport')?.getBoundingClientRect()
    const tracks = [...(board?.querySelectorAll('.trainer-schedule-day__page:not([aria-hidden]) .trainer-schedule-day__track') ?? [])]
    if (!board || !viewport || !tracks.length || board.scrollWidth > board.clientWidth + 1) return false
    return tracks.every((t) => {
      const r = t.getBoundingClientRect()
      return r.left >= viewport.left - 1 && r.right <= viewport.right + 1 && r.width >= 20
    })
  })
}

/** Страница не листается: часы листаются внутри сетки, меню режимов «⋮» всегда на экране. */
function fitsScreen(page) {
  return page.evaluate(() => {
    const d = globalThis.document
    const sw = d.querySelector('.trainer-schedule-view-menu__toggle')?.getBoundingClientRect()
    const board = d.querySelector('.trainer-schedule-day__board')?.getBoundingClientRect()
    return (
      d.scrollingElement.scrollHeight <= globalThis.innerHeight + 1 &&
      Boolean(sw) &&
      sw.top >= 0 &&
      Boolean(board) &&
      board.height >= 300
    )
  })
}

async function pickView(page, name) {
  await page.getByRole('button', { name: /^Режим календаря/ }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
}

/** «⋮» справа, слева пустышка той же ширины — дата ровно по центру шапки. */
function headIsSymmetric(page) {
  return page.evaluate(() => {
    const d = globalThis.document
    const box = (sel) => d.querySelector(sel)?.getBoundingClientRect()
    const head = box('.trainer-schedule-day__head')
    const menu = box('.trainer-schedule-view-menu__toggle')
    const spacer = box('.trainer-schedule-day__head-spacer')
    const title = box('.trainer-schedule-day__title')
    if (!head || !menu || !spacer || !title) return false
    const mirrored = Math.abs(menu.width - spacer.width) <= 1 && Math.abs(spacer.left - head.left - (head.right - menu.right)) <= 1
    const onRight = menu.left > head.left + head.width / 2
    const centered = Math.abs(title.left + title.width / 2 - (head.left + head.width / 2)) <= 2
    return mirrored && centered && onRight
  })
}

/** «+» как в Google Календаре: маленькая плавающая кнопка в правом нижнем углу сетки, не в шапке. */
function addIsFab(page) {
  return page.evaluate(() => {
    const d = globalThis.document
    const add = d.querySelector('.trainer-schedule-day__add')
    const card = d.querySelector('.trainer-schedule-day')?.getBoundingClientRect()
    const body = d.querySelector('.trainer-schedule-day__body')?.getBoundingClientRect()
    if (!add || !card || !body || add.closest('.trainer-schedule-day__head')) return false
    const b = add.getBoundingClientRect()
    return b.width <= 40 && body.right - b.right <= 20 && body.bottom - b.bottom <= 20 && b.top > card.top + card.height / 2
  })
}

const entryAt = (page, hhmm) => page.locator(`.trainer-schedule-day__entry[aria-label^="${hhmm}"]`).first()

async function center(locator) {
  const b = await locator.boundingBox()
  return { x: b.x + b.width / 2, y: b.y + Math.min(20, b.height / 2) }
}

export async function run(browser) {
  const c = createChecks('coach-schedule')
  const { backend, schedule } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  const at = (min) => schedule.filter((e) => e.start_minutes === min && e.day_date === isoDay(0))
  try {
    await page.goto(`${ORIGIN}/coach`)
    await page.getByLabel('Логин').fill(TRAINER_LOGIN)
    await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    await page.locator('.trainer-schedule-day__board').waitFor({ timeout: 15_000 })
    await scrollBoardTo(page, 9 * 60)
    c.ok(await entryAt(page, '10:00').isVisible(), 'день: запись 10:00 с сервера')
    c.ok((await page.locator('.trainer-schedule-day__entry-start').count()) === 0, 'на телефоне нет кнопки «Начать тренировку»')
    c.ok((await page.getByRole('button', { name: 'Вперёд' }).count()) === 0, 'стрелок нет — листаем пальцем, как в Google Календаре')
    await screenshot(page, 'coach-calendar-day')
    c.ok(await fitsScreen(page), 'день: всё в одном экране, меню режимов «⋮» не уезжает')
    c.ok(await headIsSymmetric(page), 'шапка симметрична: «⋮» справа, дата по центру')
    c.ok(await addIsFab(page), '«+» — маленькая кнопка в правом нижнем углу сетки, как в Google Календаре')
    await page.getByRole('button', { name: /^Режим календаря/ }).click()
    c.ok((await page.getByRole('menuitemradio').count()) === 4, 'меню «⋮»: четыре режима')
    await screenshot(page, 'coach-calendar-view-menu')
    await page.keyboard.press('Escape')
    c.ok((await page.getByRole('menu').count()) === 0, 'меню «⋮»: Escape закрывает')

    const cdp = await context.newCDPSession(page)
    const dayTitle = await titleText(page, '.trainer-schedule-day__title')
    await touchSwipe(cdp, page, '.trainer-schedule-day__board', -160)
    const nextTitle = await titleText(page, '.trainer-schedule-day__title')
    c.ok(nextTitle !== dayTitle, `взмах влево — следующий день (${dayTitle} → ${nextTitle})`)
    c.ok((await page.getByRole('dialog').count()) === 0, 'взмах по часам не открыл форму новой записи')
    await touchSwipe(cdp, page, '.trainer-schedule-day__board', 160)
    c.ok((await titleText(page, '.trainer-schedule-day__title')) === dayTitle, 'взмах вправо — обратно на сегодня')

    await pickView(page, 'Неделя')
    await page.locator('.trainer-schedule-day--week').waitFor({ timeout: 10_000 })
    c.ok(await fitsScreen(page), 'неделя: всё в одном экране')
    c.ok(await currentDaysFit(page), 'неделя: все 7 дней влезают по ширине, без прокрутки вбок')
    c.ok(
      (await page.locator('.trainer-schedule-day__col-heads .trainer-schedule-day__page:not([aria-hidden]) .trainer-schedule-day__col-head').count()) === 7,
      'неделя: 7 колонок пн–вс',
    )
    const heads = await scheduleHeadsLayout(page)
    c.ok(heads.clipped <= 1 && heads.height >= 28, `неделя: шапка дней не обрезана по высоте (${heads.height}px)`)
    c.ok(heads.drift <= 1, `неделя: колонки шапки ровно над колонками сетки (сдвиг ${heads.drift}px)`)
    await screenshot(page, 'coach-calendar-week')
    const weekTitle = await titleText(page, '.trainer-schedule-day__title')
    await touchSwipe(cdp, page, '.trainer-schedule-day__board', -160)
    c.ok((await titleText(page, '.trainer-schedule-day__title')) !== weekTitle, 'неделя: взмах влево — следующая неделя')
    await touchSwipe(cdp, page, '.trainer-schedule-day__board', 160)
    await pickView(page, '3 дня')
    await page.locator('.trainer-schedule-day--multi').waitFor({ timeout: 10_000 })
    c.ok(await fitsScreen(page), '3 дня: всё в одном экране')
    c.ok(await currentDaysFit(page), '3 дня: все три дня влезают по ширине, без прокрутки вбок')
    await screenshot(page, 'coach-calendar-3days')
    await pickView(page, 'День')
    await page.locator('.trainer-schedule-day__board').waitFor({ timeout: 10_000 })

    /* Новая запись с клиентом на 15:00. */
    await scrollBoardTo(page, 14 * 60)
    await page.locator('.trainer-schedule-day__hour-slot[aria-label$="в 15:00"]').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(CLIENT_NAME).check()
    c.ok((await dialog.getByRole('button', { name: /Начать|Продолжить/ }).count()) === 0, 'в форме нет запуска тренировки')
    const durationInput = dialog.getByTestId('schedule-duration')
    await durationInput.fill('500')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    c.ok(await dialog.getByText('Длительность — от 15 до 480 минут').isVisible(), 'длительность 500 мин не сохраняется — понятная ошибка')
    await durationInput.fill('45')
    c.ok(await dialog.getByText('до 15:45').isVisible(), 'подсказка конца записи «до 15:45»')
    await screenshot(page, 'coach-calendar-form')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
    const createdOk = await waitFor(
      () => at(900).some((e) => e.client_ids?.[0] === CLIENT_ID && e.trainer_id === TRAINER_ID && e.duration_minutes === 45),
      10_000,
    )
    c.ok(createdOk, 'сервер: запись 15:00 с клиентом на 45 мин создана сразу')

    /* Перенос пальцем 15:00 → 16:00 и «Отменить» (вторая правка той же записи — без ложного «обновите»). */
    await scrollBoardTo(page, 14 * 60)
    await entryAt(page, '15:00').waitFor({ timeout: 10_000 })
    const from = await center(entryAt(page, '15:00'))
    await touchDrag(cdp, page, from, { x: from.x, y: from.y + 60 * PX_PER_MIN })
    c.ok(await waitFor(() => at(960).length === 1, 10_000), 'сервер: запись перенесена на 16:00')
    c.ok(await page.getByText(/Перенесено на .*16:00/).isVisible(), 'плашка «Перенесено на … 16:00»')
    await screenshot(page, 'coach-calendar-moved')
    await page.getByRole('button', { name: 'Отменить' }).click()
    c.ok(await waitFor(() => at(900).length === 1, 10_000), 'сервер: «Отменить» вернул запись на 15:00')

    /* Планшет поменял запись, пока на телефоне была открыта форма. */
    await scrollBoardTo(page, 14 * 60)
    await entryAt(page, '15:00').click()
    const edit = page.getByRole('dialog')
    await edit.getByRole('button', { name: 'Изменить' }).click()
    const row = at(900)[0]
    row.duration_minutes = 90
    row.updated_at = new Date(Date.now() + 1000).toISOString()
    await edit.getByLabel('Время').fill('17:00')
    await edit.getByRole('button', { name: 'Сохранить' }).click()
    const conflictShown = await edit
      .getByRole('alert')
      .filter({ hasText: 'Запись изменилась на планшете' })
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    c.ok(conflictShown, 'устаревшая правка — «Запись изменилась на планшете — обновите»')
    c.ok(at(900).length === 1 && at(900)[0].duration_minutes === 90, 'сервер: правка планшета не затёрта')
    await screenshot(page, 'coach-calendar-conflict')
    await edit.getByRole('button', { name: 'Отмена' }).click()

    /* После обновления — удалить. */
    await page.waitForTimeout(300)
    await scrollBoardTo(page, 14 * 60)
    await entryAt(page, '15:00').click()
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click()
    c.ok(await waitFor(() => at(900).length === 0, 10_000), 'сервер: запись удалена')

    /* Завершённая тренировка не двигается. */
    await scrollBoardTo(page, 17 * 60)
    const lockedFrom = await center(entryAt(page, '18:00'))
    await touchDrag(cdp, page, lockedFrom, { x: lockedFrom.x, y: lockedFrom.y + 60 * PX_PER_MIN })
    c.ok(await page.getByText(/Тренировка по записи завершена/).isVisible(), 'завершённая тренировка — плашка, перенос не начат')
    c.ok(at(18 * 60).length === 1, 'сервер: завершённый слот остался на 18:00')

    /* Ночная группа: 15 клиентов на один час сохраняются все, 16-го отметить нельзя (раньше молча оставались 10). */
    await scrollBoardTo(page, 22 * 60)
    await page.locator('.trainer-schedule-day__hour-slot[aria-label$="в 23:00"]').click()
    const group = page.getByRole('dialog')
    for (const name of GROUP) await group.getByLabel(name).check()
    c.ok((await group.getByTestId('schedule-clients-count').innerText()).includes('Выбрано 15 из 15'), 'группа: «Выбрано 15 из 15»')
    c.ok(await group.getByLabel(CLIENT_NAME).isDisabled(), 'группа: 16-го клиента отметить нельзя')
    await screenshot(page, 'coach-calendar-group-15')
    await group.getByRole('button', { name: 'Сохранить' }).click()
    await group.waitFor({ state: 'hidden', timeout: 10_000 })
    c.ok(await waitFor(() => at(23 * 60)[0]?.client_ids?.length === 15, 10_000), 'сервер: ночная запись 23:00 с 15 клиентами сохранена целиком')

    /* Как в Google Календаре: в плитке клиенты строками — второй виден, а не спрятан за «…». */
    await pickView(page, '3 дня')
    await page.locator('.trainer-schedule-day--multi').waitFor({ timeout: 10_000 })
    await scrollBoardTo(page, 22 * 60)
    const tile = entryAt(page, '23:00')
    await tile.waitFor({ timeout: 10_000 })
    const visibleLines = await tile.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [...el.querySelectorAll('.trainer-schedule-day__entry-line')]
        .filter((l) => {
          const r = l.getBoundingClientRect()
          return r.bottom <= box.bottom + 1 && r.height >= 10
        })
        .map((l) => l.textContent)
    })
    c.ok(visibleLines.length >= 2 && visibleLines[1] === 'Группа У.', `3 дня: в плитке видно несколько клиентов коротко (${visibleLines.slice(0, 3).join(' | ')})`)
    await screenshot(page, 'coach-calendar-group-tile')
    await tile.click()
    const groupView = page.getByRole('dialog')
    c.ok((await groupView.getByRole('button', { name: 'Сохранить' }).count()) === 0, 'тап по записи — просмотр, не форма')
    c.ok(await groupView.getByText('Клиентов: 15').isVisible(), 'просмотр: «Клиентов: 15»')
    c.ok((await groupView.locator('.trainer-schedule-view__client-list li').count()) === 15, 'просмотр: все 15 клиентов списком')
    c.ok((await groupView.getByRole('link').count()) === 0, 'телефон: имена без ссылок на карточку (её нет на телефоне)')
    await screenshot(page, 'coach-calendar-group-view')
    await groupView.getByRole('button', { name: 'Закрыть' }).click()
    await pickView(page, 'День')
    await page.locator('.trainer-schedule-day__board').waitFor({ timeout: 10_000 })

    await pickView(page, 'Месяц')
    await page.locator('.trainer-schedule-month').first().waitFor({ timeout: 10_000 })
    await screenshot(page, 'coach-calendar-month')
    const monthTitle = await titleText(page, '.trainer-schedule-month__title')
    await touchSwipe(cdp, page, '.trainer-schedule-month__grid', -160)
    const nextMonth = await titleText(page, '.trainer-schedule-month__title')
    c.ok(nextMonth !== monthTitle, `месяц: взмах влево — следующий месяц (${monthTitle} → ${nextMonth})`)
    c.ok((await page.locator('.trainer-schedule-day').count()) === 0, 'взмах по месяцу не открыл день')

    await page.getByRole('button', { name: /выбрать месяц$/ }).click()
    const picker = page.getByRole('dialog', { name: 'Выбор месяца' })
    c.ok((await picker.getByRole('button', { pressed: true }).innerText()) === 'Ноя', 'выбор месяца: открыт на текущем месяце листания')
    await screenshot(page, 'coach-calendar-month-picker')
    await picker.getByRole('button', { name: 'Дек', exact: true }).click()
    c.ok((await titleText(page, '.trainer-schedule-month__title')) === 'Декабрь 2026', 'выбор месяца: тап «Дек» — Декабрь 2026')
    await page.getByRole('button', { name: /выбрать месяц$/ }).click()
    await picker.getByRole('button', { name: 'Следующий год' }).click()
    await picker.getByRole('button', { name: 'Фев', exact: true }).click()
    c.ok((await titleText(page, '.trainer-schedule-month__title')) === 'Февраль 2027', 'выбор месяца: стрелка года и «Фев» — Февраль 2027')
    c.ok((await page.getByRole('dialog', { name: 'Выбор месяца' }).count()) === 0, 'выбор месяца закрылся после выбора')
    await page.getByRole('button', { name: /^Режим календаря/ }).click()
    await screenshot(page, 'coach-calendar-view-menu-today')
    await page.getByRole('menuitem', { name: 'Сегодня' }).click()
    const todayTitle = await titleText(page, '.trainer-schedule-month__title')
    c.ok(todayTitle === monthTitle, `меню «⋮» → «Сегодня» вернуло к текущему месяцу (${todayTitle})`)
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'coach-schedule-FAIL').catch(() => null)
    c.ok(false, `Ежедневник на телефоне: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
