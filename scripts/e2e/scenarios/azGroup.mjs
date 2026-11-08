/**
 * Группа АЗ: инструктор на планшете пишет всем подопечным и закрепляет.
 * Клиент видит «Группа АЗ · имя», полосу закрепа без крестика и отвечает.
 * Телефон инструктора открывает /coach/az-group. Закрепляет только инструктор.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, fillCoachCredentials, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'
import { azGroupClientHref, azGroupParticipantKey } from '../../../src/lib/chat/azGroupCore.js'
import { coachPushUrl } from '../../../src/lib/push/pushTargetUrlCore.js'

export const name = 'группа АЗ: инструктор написал — подопечный увидел'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const MATE_ID = 'e2e00000-0000-4000-8000-0000000000b6'
const INVITE = 'e2e-az-group-invite'
const NEWS = 'Завтра бокс в 19:00'
const REPLY = 'Буду'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function setup() {
  const backend = createFakeBackend(trainerClubSeed())
  const now = new Date().toISOString()
  backend.state.clients.push({
    id: MATE_ID,
    trainer_id: TRAINER_ID,
    club_id: CLUB_ID,
    name: 'Боксёр Борис',
    phone: '+7 900 000-00-02',
    birth_date: null,
    created_at: now,
    updated_at: now,
  })
  backend.state.client_az_instructors = [
    { client_id: CLIENT_ID, instructor_id: TRAINER_ID, club_id: CLUB_ID },
    { client_id: MATE_ID, instructor_id: TRAINER_ID, club_id: CLUB_ID },
  ]
  const chat = createFakeChat(backend.state)
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule: [] })
  const portal = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: INVITE, today: isoDay(0) })
  backend.coach = coach.handle
  backend.adminData = (req, user) => chat.staff(req, user)
  backend.clientMe = (req) => {
    const authed = /^Bearer .+/.test(String(req.headers.authorization ?? ''))
    const action = String(req.body?.action ?? '')
    if (authed && req.path === '/api/client-me' && req.method === 'POST' && (action.startsWith('chat-') || action.startsWith('az-group-'))) {
      return chat.client(CLIENT_ID, req.body)
    }
    const res = portal(req)
    if (req.path === '/api/client-me' && req.method === 'GET' && res.json?.as_of) res.json.chat_attention = chat.attentionForClient(CLIENT_ID)
    return res
  }
  return { backend, chat }
}

const pushNow = (page) =>
  page.evaluate(() => globalThis.navigator.serviceWorker.dispatchEvent(new globalThis.MessageEvent('message', { data: { type: 'push-received' } })))

async function instructorWrites(c, browser, backend) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.goto(`${ORIGIN}/messages`)
    await page.getByTestId('chat-folders').getByRole('button', { name: /^Клиенты/ }).click()
    const row = page.getByTestId('az-group-row')
    c.ok(await reaches(row.getByText('Группа АЗ', { exact: true })), '«Клиенты»: строка «Группа АЗ»')
    c.ok(await reaches(row.getByText('Общий чат инструктора и подопечных')), 'пустая группа — подпись, что это за чат')
    await screenshot(page, 'az-group-tablet-list')
    await row.getByRole('link').click()
    await page.waitForURL(new RegExp(`/messages\\?.*azGroup=${TRAINER_ID}`))
    c.ok(await reaches(page.getByText('3 участника')), 'шапка: инструктор и двое подопечных')
    c.ok(await reaches(page.getByText('увидят инструктор и подопечные', { exact: false })), 'пустая лента: кто увидит')
    await page.getByTestId('chat-input').fill(NEWS)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: NEWS })), 'инструктор: сообщение в ленте')
    await page.locator('.chat-msg--mine', { hasText: NEWS }).click({ button: 'right', position: { x: 12, y: 8 } })
    await page.getByTestId('chat-msg-actions').getByRole('menuitem', { name: 'Закрепить' }).click()
    c.ok(await reaches(page.getByTestId('chat-pinned').getByText(NEWS)), 'закрепил — сверху полоса')
    await screenshot(page, 'az-group-tablet-thread')
  } catch (e) {
    await screenshot(page, 'az-group-tablet-FAIL').catch(() => null)
    c.ok(false, `инструктор на планшете: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function clientReads(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/inbox`)
    const row = page.getByTestId('az-group-row')
    c.ok(await reaches(row.getByText('Группа АЗ · Тренер Тестов')), 'клиент: строка «Группа АЗ · имя»')
    c.ok(await reaches(row.locator('.chat-row__badge', { hasText: '1' })), 'в строке кружок «1»')
    await screenshot(page, 'az-group-client-list')
    await row.getByRole('link').click()
    await page.waitForURL(`${ORIGIN}${azGroupClientHref(TRAINER_ID)}`)
    c.ok(await reaches(page.locator('.chat-msg__author', { hasText: 'Тренер Тестов' })), 'в ленте видно, кто написал')
    c.ok(await reaches(page.locator('.chat-msg', { hasText: NEWS })), 'клиент видит сообщение')
    const bar = page.getByTestId('chat-pinned')
    c.ok(await reaches(bar.getByText(NEWS)), 'клиент видит закреп')
    c.ok((await bar.getByRole('button', { name: 'Открепить' }).count()) === 0, 'клиент открепить не может')
    await page.locator('.chat-msg', { hasText: NEWS }).click({ button: 'right', position: { x: 12, y: 8 } })
    c.ok((await page.getByRole('menuitem', { name: 'Закрепить' }).count()) === 0, 'у клиента в меню нет «Закрепить»')
    await page.keyboard.press('Escape')
    await page.getByTestId('chat-input').fill(REPLY)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: REPLY })), 'клиент ответил')
    const saved = chat.state.az.messages.at(-1)
    c.ok(saved?.author_client_id === CLIENT_ID && saved?.body === REPLY, 'ответ ушёл от клиента')
    c.ok((await page.locator('.chat-msg--mine .chat-msg__tick.is-read').count()) === 0, 'инструктор ещё не открыл — одна галочка')
    const pushes = chat.state.az.pushes
    const clientKey = azGroupParticipantKey({ side: 'client', clientId: CLIENT_ID })
    const mateKey = azGroupParticipantKey({ side: 'client', clientId: MATE_ID })
    const authorKey = azGroupParticipantKey({ side: 'user', userId: TRAINER_ID })
    const newsPush = pushes.find((p) => p.to === clientKey && String(p.body).includes(NEWS))
    c.ok(Boolean(newsPush) && newsPush.url === azGroupClientHref(TRAINER_ID), 'push клиенту открывает /me/az-group')
    c.ok(pushes.some((p) => p.to === mateKey) && !pushes.some((p) => p.to === authorKey && String(p.body).includes(NEWS)), 'push ушёл второму подопечному и не автору')
    await screenshot(page, 'az-group-client-thread')
  } catch (e) {
    await screenshot(page, 'az-group-client-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function coachSees(c, page) {
  await pushNow(page)
  c.ok(await reaches(page.getByRole('link', { name: /Сообщения, новых диалогов: 1/ })), 'телефон: число на вкладке «Сообщения»')
  await page.getByRole('link', { name: /^Сообщения/ }).click()
  await page.getByTestId('chat-folders').getByRole('button', { name: /^Клиенты/ }).click()
  const row = page.getByTestId('az-group-row')
  c.ok(await reaches(row.locator('.chat-row__badge', { hasText: '1' })), '«Клиенты»: «Группа АЗ» с кружком «1»')
  c.ok(await reaches(row.getByText(`${CLIENT_NAME}: ${REPLY}`)), 'в строке — кто ответил')
  await row.getByRole('link').click()
  await page.waitForURL(`${ORIGIN}/coach/az-group`)
  c.ok(await reaches(page.locator('.chat-msg__author', { hasText: CLIENT_NAME })), 'на телефоне видно имя подопечного')
  c.ok((await page.getByTestId('chat-pinned').getByRole('button', { name: 'Открепить' }).count()) === 1, 'инструктор может открепить')
  await screenshot(page, 'az-group-coach-thread')
}

async function instructorSeesReaders(c, browser, backend) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.goto(`${ORIGIN}/messages?azGroup=${TRAINER_ID}`)
    await page.locator('.chat-msg--mine', { hasText: NEWS }).click({ button: 'right', position: { x: 12, y: 8 } })
    const seen = page.getByTestId('chat-msg-actions').getByRole('menuitem', { name: 'Прочитал 1 из 2' })
    c.ok(await reaches(seen), 'своё сообщение: «Прочитал 1 из 2»')
    await seen.click()
    const sheet = page.getByTestId('group-readers')
    c.ok(await reaches(sheet.getByRole('region', { name: 'Прочитали' }).getByText(CLIENT_NAME)), 'прочитала Анна')
    c.ok(await reaches(sheet.getByRole('region', { name: 'Ещё не прочитали' }).getByText('Боксёр Борис')), 'Борис ещё не открыл')
    c.ok(coachPushUrl(`/messages?azGroup=${TRAINER_ID}`) === '/coach/az-group', 'push инструктору на телефоне — /coach/az-group')
    await screenshot(page, 'az-group-readers')
  } catch (e) {
    await screenshot(page, 'az-group-readers-FAIL').catch(() => null)
    c.ok(false, `кто прочитал: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('az-group')
  const { backend, chat } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/coach`)
    await fillCoachCredentials(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения', exact: true })), 'телефон: пока тихо — вкладка без числа')
    await instructorWrites(c, browser, backend)
    await clientReads(c, browser, backend, chat)
    await coachSees(c, page)
    await instructorSeesReaders(c, browser, backend)
    c.ok(pageErrors.length === 0, `телефон: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'az-group-FAIL').catch(() => null)
    c.ok(false, `телефон инструктора: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
