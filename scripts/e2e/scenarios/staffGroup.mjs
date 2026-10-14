/**
 * Чат клуба: управляющая на планшете — «Тренеры» → первой строкой «Чат клуба» → пишет → push всем сотрудникам клуба,
 * кроме неё. Тренер с телефона: число на вкладке → «Коллеги» → «Чат клуба» с кружком → видит, кто написал → отвечает →
 * «Без звука»: новое без push и без числа. Главный админ: «Чаты клубов» слева → клуб → та же лента.
 * Как в группах Telegram: управляющая закрепляет объявление (тренер видит полосу, нажатие — к сообщению, открепить не может),
 * «Прочитал 1 из 3» в меню своего сообщения → окно «Прочитали / Ещё не прочитали» → открепляет.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'
import { coachPushUrl } from '../../../src/lib/push/pushTargetUrlCore.js'
import { hiddenLinkedTrainerIds } from '../../../src/lib/chat/linkedStaffCore.js'
import { pickStaffGroupMembers } from '../../../src/lib/chat/staffGroupCore.js'

export const name = 'чат клуба: управляющий написал — тренер увидел'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const MONITOR = { viewport: { width: 1600, height: 900 } }
const OTHER_CLUB = 'e2e-other-club'
const SUP_ID = 'e2e00000-0000-4000-8000-0000000000b2'
const SALES_ID = 'e2e00000-0000-4000-8000-0000000000b3'
const MATE_ID = 'e2e00000-0000-4000-8000-0000000000b4'
const ADMIN_ID = 'e2e00000-0000-4000-8000-0000000000b5'
const SUP_LOGIN = 'e2e_group_sup'
const SUP_PASSWORD = randomUUID()
const ADMIN_LOGIN = 'e2e_group_admin'
const ADMIN_PASSWORD = randomUUID()
const NEWS = 'Завтра планёрка в 9:00'
const REPLY = 'Буду'
const QUIET = 'Тихое сообщение'

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
    staff(ADMIN_ID, 'Главный Админ', 'admin', { club_id: null, login: ADMIN_LOGIN, email: `${ADMIN_LOGIN}@trainer.local`, password: ADMIN_PASSWORD }),
    staff('e2e-group-alien', 'Чужой Тренер', 'trainer', { club_id: OTHER_CLUB }),
    staff('e2e-group-blocked', 'Уволенный Тренер', 'trainer', { is_active: false }),
  )
  backend.state.clubs.push({ id: OTHER_CLUB, name: 'Москва клуб', is_active: true })
  backend.state.live_user_ids = [SUP_ID, MATE_ID]
  const chat = createFakeChat(backend.state)
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule: [] })
  backend.coach = coach.handle
  backend.adminData = (req, user) => chat.staff(req, user)
  return { backend, chat }
}

const pushNow = (page) =>
  page.evaluate(() => globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-received' } })))

async function supervisorWrites(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, SUP_LOGIN, SUP_PASSWORD)
    await page.goto(`${ORIGIN}/messages`)
    await page.getByTestId('chat-folders').getByRole('button', { name: /^Тренеры/ }).click()
    const rows = page.getByTestId('chat-contacts').locator(':scope > li')
    c.ok(await reaches(rows.first().getByText('Чат клуба')), '«Тренеры»: первой строкой — «Чат клуба»')
    c.ok(await reaches(rows.first().getByText('Общий чат сотрудников клуба')), 'пустой чат клуба — подпись, что это за чат')
    await screenshot(page, 'staff-group-supervisor-list')
    await page.getByTestId('group-row').getByRole('link').click()
    await page.waitForURL(new RegExp(`/messages\\?.*group=${CLUB_ID}`))
    const members = pickStaffGroupMembers(backend.state.users, CLUB_ID, hiddenLinkedTrainerIds(backend.state.users))
    c.ok(await reaches(page.getByText(`E2E клуб · ${members.length} участник`, { exact: false })), `шапка: клуб и число участников (${members.length})`)
    c.ok(await reaches(page.getByText('увидят все сотрудники клуба', { exact: false })), 'пустая лента: подсказка, кто увидит')
    await page.getByTestId('chat-input').fill(NEWS)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: NEWS })), 'управляющая: сообщение в ленте')
    const to = chat.state.group.pushes.map((p) => p.to).sort()
    const expected = members.map((u) => u.id).filter((id) => id !== SUP_ID).sort()
    c.ok(JSON.stringify(to) === JSON.stringify(expected), `push — всем сотрудникам клуба, кроме автора, без уволенных и чужих (${to.length})`)
    const push = chat.state.group.pushes.find((p) => p.to === TRAINER_ID)
    c.ok(push?.title === 'E2E клуб' && push?.body === `Управляющая Ольга: ${NEWS}`, 'push: заголовок — клуб, текст — «кто: что»')
    c.ok(coachPushUrl(push?.url) === '/coach/group', 'push тренеру откроет чат клуба на телефоне')

    await page.locator('.chat-msg--mine', { hasText: NEWS }).click({ button: 'right', position: { x: 12, y: 8 } })
    const actions = page.getByTestId('chat-msg-actions')
    c.ok(await reaches(actions.getByRole('menuitem', { name: 'Пока никто не прочитал' })), 'своё сообщение: в меню «Пока никто не прочитал», как в Telegram')
    await screenshot(page, 'staff-group-menu')
    await actions.getByRole('menuitem', { name: 'Закрепить' }).click()
    c.ok(await reaches(page.getByTestId('chat-pinned').getByText(NEWS)), 'закрепила — сверху «Закреплённое сообщение»')
    c.ok(chat.state.group.threads[0]?.pinned_message_id === chat.state.group.messages[0]?.id, 'закреп сохранён на сервере')
    await screenshot(page, 'staff-group-supervisor-thread')
  } catch (e) {
    await screenshot(page, 'staff-group-supervisor-FAIL').catch(() => null)
    c.ok(false, `управляющая: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function trainerReadsAndMutes(c, page, backend, chat) {
  await pushNow(page)
  c.ok(await reaches(page.getByRole('link', { name: 'Сообщения, новых диалогов: 1' })), 'тренер: пришёл push — число на вкладке «Сообщения»')
  await page.getByRole('link', { name: /^Сообщения/ }).click()
  await page.getByTestId('chat-folders').getByRole('button', { name: /^Коллеги/ }).click()
  const row = page.getByTestId('group-row')
  c.ok(await reaches(row.locator('.chat-row__badge', { hasText: '1' })), '«Коллеги»: «Чат клуба» первой строкой с кружком «1»')
  c.ok(await reaches(row.getByText(`Управляющая Ольга: ${NEWS}`)), 'в строке — кто написал и что')
  await screenshot(page, 'staff-group-coach-list')
  await row.getByRole('link').click()
  await page.waitForURL(`${ORIGIN}/coach/group`)
  c.ok(await reaches(page.locator('.chat-msg__author', { hasText: 'Управляющая Ольга' })), 'в ленте видно, кто написал')
  c.ok(await reaches(page.locator('.chat-msg', { hasText: NEWS })), 'тренер видит сообщение управляющей')
  const bar = page.getByTestId('chat-pinned')
  c.ok(await reaches(bar.getByText(NEWS)), 'тренер видит закреп над лентой')
  c.ok((await bar.getByRole('button', { name: 'Открепить' }).count()) === 0, 'тренер открепить не может')
  await page.locator('.chat-msg', { hasText: NEWS }).click({ button: 'right', position: { x: 12, y: 8 } })
  c.ok(await reaches(page.getByTestId('chat-react-menu')), 'долгое нажатие — меню реакций')
  c.ok((await page.getByTestId('chat-msg-actions').count()) === 0, 'у тренера в меню нет «Закрепить», у чужого — нет «Кто прочитал»')
  await page.keyboard.press('Escape')
  await page.getByTestId('chat-input').fill(REPLY)
  await page.getByTestId('chat-send').click()
  c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: REPLY })), 'тренер ответил в чат клуба')
  const saved = chat.state.group.messages.at(-1)
  c.ok(saved?.author_user_id === TRAINER_ID && saved?.body === REPLY, 'ответ ушёл на сервер от тренера')
  const read = page.locator('.chat-msg--mine .chat-msg__tick.is-read')
  c.ok((await read.count()) === 0, 'ответ ещё никто не открыл — одна галочка')
  const sup = backend.state.users.find((u) => u.id === SUP_ID)
  chat.staff({ method: 'GET', searchParams: new URLSearchParams({ action: 'chat', view: 'group-thread' }) }, sup)
  await pushNow(page)
  c.ok(await reaches(read.first()), 'управляющая открыла чат — у тренера ✓✓')
  await screenshot(page, 'staff-group-coach-thread')

  for (let i = 1; i <= 25; i++) {
    chat.staff({ method: 'POST', searchParams: new URLSearchParams({ action: 'chat' }), body: { op: 'group-send', body: `Смена ${i}` } }, sup)
  }
  await pushNow(page)
  await page.locator('.chat-msg', { hasText: 'Смена 25' }).waitFor()
  await page.waitForTimeout(400)
  const news = page.locator('.chat-msg', { hasText: NEWS })
  const inView = async () => {
    const [m, feed] = await Promise.all([news.boundingBox(), page.getByTestId('chat-feed').boundingBox()])
    return Boolean(m && feed && m.y >= feed.y - 1 && m.y + m.height <= feed.y + feed.height + 1)
  }
  c.ok(!(await inView()), 'закреплённое уехало вверх под новыми сообщениями')
  await bar.getByRole('button', { name: /Показать/ }).click()
  await page.waitForTimeout(900)
  c.ok(await inView(), 'нажал закреп — лента доехала до сообщения')
  await screenshot(page, 'staff-group-coach-pinned-jump')

  const mute = page.getByTestId('group-mute')
  await mute.click()
  c.ok(await reaches(page.locator('[data-testid="group-mute"][aria-pressed="true"]')), '«Без звука» включён')
  const before = chat.state.group.pushes.length
  chat.staff({ method: 'POST', searchParams: new URLSearchParams({ action: 'chat' }), body: { op: 'group-send', body: QUIET } }, sup)
  c.ok(!chat.state.group.pushes.slice(before).some((p) => p.to === TRAINER_ID), 'без звука: push тренеру не уходит')
  await page.getByRole('link', { name: 'Все диалоги' }).click()
  await pushNow(page)
  await page.getByTestId('chat-folders').getByRole('button', { name: /^Коллеги/ }).click()
  c.ok(await reaches(page.getByTestId('group-row').getByLabel('Без звука')), 'в строке — значок «без звука»')
  c.ok(await reaches(page.getByRole('link', { name: 'Сообщения', exact: true })), 'без звука: на вкладке «Сообщения» числа нет')
  await screenshot(page, 'staff-group-coach-muted')
}

/** Управляющая: «Кто прочитал» объявление — кому напомнить; потом открепляет. */
async function supervisorSeesReaders(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, SUP_LOGIN, SUP_PASSWORD)
    await page.goto(`${ORIGIN}/messages?group=${CLUB_ID}`)
    const bar = page.getByTestId('chat-pinned')
    await bar.getByRole('button', { name: /Показать/ }).click()
    await page.locator('.chat-msg--mine', { hasText: NEWS }).click({ button: 'right', position: { x: 12, y: 8 } })
    const seen = page.getByTestId('chat-msg-actions').getByRole('menuitem', { name: 'Прочитал 1 из 3' })
    c.ok(await reaches(seen), 'управляющая: в меню своего сообщения «Прочитал 1 из 3»')
    await seen.click()
    const sheet = page.getByTestId('group-readers')
    c.ok(await reaches(sheet.getByRole('region', { name: 'Прочитали' }).getByText('Тренер Тестов')), '«Кто прочитал»: тренер — в «Прочитали»')
    const late = sheet.getByRole('region', { name: 'Ещё не прочитали' })
    c.ok((await reaches(late.getByText('Коллега Игорь'))) && (await reaches(late.getByText('Менеджер Пётр'))), '«Ещё не прочитали»: коллега и менеджер — кому напомнить')
    await screenshot(page, 'staff-group-readers')
    await sheet.getByRole('button', { name: 'Закрыть' }).click()
    await bar.getByRole('button', { name: 'Открепить' }).click()
    c.ok(await reaches(bar, 'hidden'), 'открепила — полоса пропала')
    c.ok(chat.state.group.threads[0]?.pinned_message_id == null, 'закреп снят на сервере')
  } catch (e) {
    await screenshot(page, 'staff-group-readers-FAIL').catch(() => null)
    c.ok(false, `управляющая, кто прочитал: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function adminReads(c, browser, backend) {
  const context = await newE2eContext(browser, backend, MONITOR)
  const page = await context.newPage()
  try {
    await loginUi(page, ADMIN_LOGIN, ADMIN_PASSWORD)
    await page.goto(`${ORIGIN}/messages`)
    const rail = page.getByRole('navigation', { name: 'Клубы' })
    await rail.getByRole('button', { name: /Чаты клубов/ }).click()
    const list = page.getByTestId('admin-groups')
    c.ok(await reaches(list.getByText('Москва клуб')), 'админ: «Чаты клубов» — чат каждого клуба сети')
    await list.getByRole('link', { name: /E2E клуб/ }).click()
    await page.waitForURL(new RegExp(`group=${CLUB_ID}`))
    c.ok(await reaches(page.locator('.chat-msg', { hasText: QUIET })), 'админ видит ленту чата клуба')
    c.ok(await reaches(page.getByTestId('chat-input')), 'админ может написать в чат клуба')
    await screenshot(page, 'staff-group-admin')
  } catch (e) {
    await screenshot(page, 'staff-group-admin-FAIL').catch(() => null)
    c.ok(false, `админ: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('staff-group')
  const { backend, chat } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/coach`)
    await page.getByLabel('Логин').fill(TRAINER_LOGIN)
    await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения', exact: true })), 'тренер: пока тихо — вкладка «Сообщения» без числа')
    await supervisorWrites(c, browser, backend, chat)
    await trainerReadsAndMutes(c, page, backend, chat)
    await supervisorSeesReaders(c, browser, backend, chat)
    await adminReads(c, browser, backend)
    c.ok(pageErrors.length === 0, `телефон: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'staff-group-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
