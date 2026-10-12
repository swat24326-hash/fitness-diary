/**
 * Переписка сотрудников: тренер с телефона → папка «Администрация» (управляющая ярко, менеджер без приложения тускло,
 * главного админа и чужого клуба нет) → пишет управляющей → push ей ведёт в диалог. Управляющая на планшете:
 * папка «Тренеры» с числом → диалог → ответ → push тренеру откроет диалог на телефоне → тренер видит ответ.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'
import { coachPushUrl } from '../../../src/lib/push/pushTargetUrlCore.js'
import { staffDmSideOf } from '../../../src/lib/chat/staffDmAccessCore.js'

export const name = 'переписка сотрудников: тренер ↔ управляющий'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const SUP_ID = 'e2e00000-0000-4000-8000-0000000000a2'
const SALES_ID = 'e2e00000-0000-4000-8000-0000000000a3'
const MATE_ID = 'e2e00000-0000-4000-8000-0000000000a4'
const SUP_LOGIN = 'e2e_sup'
const SUP_PASSWORD = randomUUID()
const ASK = 'Сломан тренажёр в зале 2'
const ANSWER = 'Спасибо, вызову мастера'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function setup() {
  const backend = createFakeBackend(trainerClubSeed())
  const staff = (id, name, role, extra = {}) => ({ id, name, role, club_id: CLUB_ID, is_active: true, ...extra })
  backend.state.users.push(
    staff(SUP_ID, 'Управляющая Ольга', 'supervisor', { login: SUP_LOGIN, email: `${SUP_LOGIN}@trainer.local`, password: SUP_PASSWORD }),
    staff(SALES_ID, 'Менеджер Пётр', 'sales_manager'),
    staff(MATE_ID, 'Коллега Игорь', 'trainer'),
    staff('e2e-admin-net', 'Главный Админ', 'admin', { club_id: null }),
    staff('e2e-alien', 'Чужой Тренер', 'trainer', { club_id: 'e2e-other-club' }),
    staff('e2e-blocked', 'Уволенный Тренер', 'trainer', { is_active: false }),
  )
  backend.state.live_user_ids = [SUP_ID, MATE_ID]
  const chat = createFakeChat(backend.state)
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule: [] })
  backend.coach = coach.handle
  backend.adminData = (req, user) => chat.staff(req, user)
  return { backend, chat, coach }
}

const titles = (page) => page.getByTestId('chat-contacts').locator('.chat-row__title').allInnerTexts()

async function trainerWrites(c, page, chat, coach) {
  await page.goto(`${ORIGIN}/coach`)
  await page.getByLabel('Логин').fill(TRAINER_LOGIN)
  await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  coach.setPhoneStatus('approved')
  await page.getByRole('button', { name: 'Проверить сейчас' }).click()
  await page.getByRole('link', { name: /^Сообщения/ }).click()
  const folders = page.getByTestId('chat-folders')
  c.ok(await reaches(folders.getByRole('button', { name: 'Коллеги' })), 'телефон: папки «Клиенты · Коллеги · Администрация»')
  await folders.getByRole('button', { name: 'Коллеги' }).click()
  c.ok(JSON.stringify(await titles(page)) === '["Коллега Игорь"]', 'Коллеги: тренер своего клуба, без чужих и заблокированных')
  await folders.getByRole('button', { name: 'Администрация' }).click()
  const admin = await titles(page)
  c.ok(JSON.stringify(admin) === '["Управляющая Ольга","Менеджер Пётр"]', `Администрация: управляющая ярко сверху, менеджер ниже (${admin.join(', ')})`)
  c.ok((await page.locator('.chat-row--dim').count()) === 1, 'Администрация: менеджер без приложения — тускло')
  await screenshot(page, 'staff-dm-folders')

  await page.getByRole('link', { name: /Управляющая Ольга/ }).click()
  await page.waitForURL(`${ORIGIN}/coach/dm/${SUP_ID}`)
  c.ok(await reaches(page.getByText('Управляющий увидит ваше сообщение', { exact: false })), 'пустой диалог: подсказка, кто увидит')
  await page.getByTestId('chat-input').fill(ASK)
  await page.getByTestId('chat-send').click()
  c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: ASK })), 'тренер: сообщение в ленте')
  const saved = chat.state.dm.messages.at(-1)
  c.ok(saved?.author_user_id === TRAINER_ID && saved?.body === ASK, 'на сервер ушло сообщение от тренера')
  const push = chat.state.dm.pushes.at(-1)
  c.ok(push?.to === SUP_ID && push?.url === `/messages/dm/${TRAINER_ID}`, 'push управляющей ведёт в диалог с тренером')
}

async function supervisorAnswers(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, SUP_LOGIN, SUP_PASSWORD)
    await page.goto(`${ORIGIN}/messages?tab=chats`)
    const folders = page.getByTestId('chat-folders')
    const trainers = folders.getByRole('button', { name: /^Тренеры/ })
    c.ok(await reaches(trainers), 'планшет управляющего: папка «Тренеры»')
    c.ok(await reaches(trainers.getByLabel('Ждут ответа: 1')), '«Тренеры»: 1 ждёт ответа')
    c.ok(await reaches(folders.getByRole('button', { name: /^Клиенты/ })), 'и «Клиенты» — прежний список диалогов')
    await trainers.click()
    const row = page.getByRole('link', { name: /Тренер Тестов/ })
    c.ok(await reaches(row.locator('.chat-row__badge', { hasText: '1' })), 'у тренера кружок «1»')
    await screenshot(page, 'staff-dm-supervisor-list')
    await row.click()
    await page.waitForURL(`${ORIGIN}/messages/dm/${TRAINER_ID}`)
    c.ok(await reaches(page.locator('.chat-msg', { hasText: ASK })), 'управляющая видит сообщение тренера')
    await page.getByTestId('chat-input').fill(ANSWER)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: ANSWER })), 'ответ в ленте')
    const push = chat.state.dm.pushes.at(-1)
    c.ok(push?.to === TRAINER_ID && coachPushUrl(push.url) === `/coach/dm/${SUP_ID}`, 'push тренеру откроет диалог на телефоне')
    await screenshot(page, 'staff-dm-supervisor-thread')
  } catch (e) {
    await screenshot(page, 'staff-dm-supervisor-FAIL').catch(() => null)
    c.ok(false, `управляющая: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/** Тренер в приложении зала на узком телефоне: шапка не шире экрана, поле ввода у низа видимой части (INC-2026-10-11-04). */
async function trainerNarrowPhoneThread(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, { ...PHONE, viewport: { width: 360, height: 780 } })
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.goto(`${ORIGIN}/messages/dm/${SUP_ID}`)
    await page.getByTestId('chat-input').waitFor()
    await page.waitForTimeout(300)
    const opened = await page.evaluate(() => ({
      lastBottom: [...globalThis.document.querySelectorAll('.chat-msg')].at(-1).getBoundingClientRect().bottom,
      composeTop: globalThis.document.querySelector('.chat-compose').getBoundingClientRect().top,
    }))
    c.ok(
      opened.lastBottom <= opened.composeTop + 1,
      `открыл диалог — последнее сообщение над полем ввода, не под ним (низ ${Math.round(opened.lastBottom)}, поле с ${Math.round(opened.composeTop)})`,
    )
    await page.evaluate(() => globalThis.scrollTo(0, 0))
    const m = await page.evaluate(() => {
      const root = globalThis.document.documentElement
      return {
        wide: root.scrollWidth - root.clientWidth,
        composerBottom: globalThis.document.querySelector('.chat-compose').getBoundingClientRect().bottom,
        visible: globalThis.visualViewport?.height ?? globalThis.innerHeight,
      }
    })
    c.ok(m.wide <= 0, `узкий телефон тренера: страница не шире экрана (лишних ${m.wide}px)`)
    c.ok(m.composerBottom <= m.visible + 1, `поле ввода в видимой части (низ ${Math.round(m.composerBottom)} из ${Math.round(m.visible)})`)
    await screenshot(page, 'staff-dm-trainer-narrow')

    /* Клавиатура Android сжимает страницу: был внизу — последнее сообщение остаётся над полем ввода. */
    await page.evaluate(() => globalThis.scrollTo(0, globalThis.document.documentElement.scrollHeight))
    await page.waitForTimeout(200)
    await page.setViewportSize({ width: 360, height: 420 })
    await page.waitForTimeout(400)
    const kb = await page.evaluate(() => {
      const last = [...globalThis.document.querySelectorAll('.chat-msg')].at(-1).getBoundingClientRect()
      const compose = globalThis.document.querySelector('.chat-compose').getBoundingClientRect()
      return { lastBottom: last.bottom, composeTop: compose.top }
    })
    c.ok(
      kb.lastBottom <= kb.composeTop + 1,
      `клавиатура открылась — последнее сообщение над полем ввода (низ ${Math.round(kb.lastBottom)}, поле с ${Math.round(kb.composeTop)})`,
    )
    await screenshot(page, 'staff-dm-trainer-keyboard')

    /* Читает историю выше, а собеседник ответил — лента не прыгает вниз, появляется «↓ Новые». */
    await page.evaluate(() => globalThis.scrollTo(0, 0))
    await page.waitForTimeout(200)
    const sup = backend.state.users.find((u) => u.id === SUP_ID)
    chat.staff({ method: 'POST', searchParams: new URLSearchParams({ action: 'chat' }), body: { op: 'dm-send', user_id: TRAINER_ID, body: 'Пока ты листал' } }, sup)
    const dmThread = chat.state.dm.threads.find((t) => staffDmSideOf(t, TRAINER_ID) && staffDmSideOf(t, SUP_ID))
    const trainerUnread = () => dmThread[`${staffDmSideOf(dmThread, TRAINER_ID)}_unread`]
    await page.evaluate(() =>
      globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-received' } })),
    )
    const newBelow = page.getByTestId('chat-new-below')
    c.ok(await reaches(newBelow), 'читает историю, пришёл ответ — кнопка «↓ Новые»')
    c.ok((await page.evaluate(() => globalThis.scrollY)) < 50, 'лента не дёрнулась вниз, пока читает историю')
    c.ok(trainerUnread() === 1, 'новое ещё не на экране — «прочитано» не поставлено, у управляющей без ✓✓')
    await screenshot(page, 'staff-dm-new-below')
    await newBelow.click()
    c.ok(await reaches(page.getByTestId('chat-new-below'), 'hidden'), '«↓ Новые» — вниз к ответу, кнопка исчезла')
    await page.waitForTimeout(800)
    c.ok(trainerUnread() === 0, 'долистал до нового — «прочитано» поставлено сразу, без ожидания опроса')
    const lateBox = await page.locator('.chat-msg', { hasText: 'Пока ты листал' }).boundingBox()
    const composeTop = await page.evaluate(() => globalThis.document.querySelector('.chat-compose').getBoundingClientRect().top)
    c.ok(lateBox && lateBox.y + lateBox.height <= composeTop + 1, 'новое сообщение видно над полем ввода')
  } catch (e) {
    await screenshot(page, 'staff-dm-trainer-narrow-FAIL').catch(() => null)
    c.ok(false, `узкий телефон тренера: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('staff-dm')
  const { backend, chat, coach } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await trainerWrites(c, page, chat, coach)
    await page.getByRole('link', { name: 'Все диалоги' }).click()
    const tab = page.getByRole('link', { name: 'Сообщения, новых диалогов: 1' })
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения', exact: true })), 'вкладка «Сообщения» без числа, пока ответа нет')
    await supervisorAnswers(c, browser, backend, chat)
    await page.evaluate(() =>
      globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-received' } })),
    )
    c.ok(
      await tab.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false),
      'пришёл push — число на вкладке «Сообщения» сразу, без переключения вкладок',
    )
    const first = chat.state.dm.messages[0]
    for (let i = 1; i <= 20; i++) {
      chat.state.dm.messages.splice(i - 1, 0, { ...first, id: `dmm-old-${i}`, body: `История ${i}`, created_at: new Date(Date.parse(first.created_at) - (21 - i) * 60_000).toISOString() })
    }
    await trainerNarrowPhoneThread(c, browser, backend, chat)
    /* Приложение уже открыто, нажали на push — открывается сам диалог (INC-2026-10-12-04). */
    await page.goto(`${ORIGIN}/coach`)
    await page.waitForLoadState('networkidle')
    await page.evaluate((url) => {
      globalThis.__noReload = true
      globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-open', url } }))
    }, `/coach/dm/${SUP_ID}`)
    c.ok(
      await page
        .waitForURL(`**/coach/dm/${SUP_ID}`, { timeout: 5_000 })
        .then(() => true)
        .catch(() => false),
      'нажатие на push при открытом приложении — сразу в переписку',
    )
    c.ok(await page.evaluate(() => globalThis.__noReload === true), 'без перезагрузки страницы')
    c.ok(await reaches(page.locator('.chat-msg:not(.chat-msg--mine)', { hasText: ANSWER })), 'тренер видит ответ управляющей')
    c.ok(await reaches(page.locator('.chat-msg--mine .chat-msg__tick.is-read').first()), 'у тренера две галочки — прочитано')
    await screenshot(page, 'staff-dm-coach-thread')
    c.ok(pageErrors.length === 0, `телефон: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'staff-dm-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
