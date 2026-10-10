/**
 * Переписка клиента с тренером: клиент на iPhone пишет тренеру ссылку Wildberries →
 * у тренера на планшете конверт «1 новых» → «Диалоги с клиентами» → ссылка кликабельна → ответ →
 * конверт гаснет → клиент видит ответ с именем тренера и точку на конверте /me.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'

export const name = 'переписка: клиент пишет, тренер отвечает'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const INVITE = 'e2e-chat-invite'
const WB = 'https://www.wildberries.ru/catalog/123456/detail.aspx'
const QUESTION = `Посмотрите резинку ${WB}, подойдёт?`
const REPLY = 'Подойдёт, берите среднюю жёсткость'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function wireClient(backend, chat) {
  const portal = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: INVITE, today: isoDay(0) })
  backend.clientMe = (req) => {
    const authed = /^Bearer .+/.test(String(req.headers.authorization ?? ''))
    if (authed && req.path === '/api/client-me' && req.method === 'POST' && String(req.body?.action ?? '').startsWith('chat-')) {
      return chat.client(CLIENT_ID, req.body)
    }
    const res = portal(req)
    if (req.path === '/api/client-me' && req.method === 'GET' && res.json?.as_of) res.json.chat_attention = chat.attentionForClient(CLIENT_ID)
    return res
  }
  backend.adminData = (req, user) => chat.staff(req, user)
}

async function clientWrites(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/inbox`)
    const trainerRow = page.getByRole('link', { name: /^Тренер · / })
    c.ok(await reaches(trainerRow), '«Сообщения»: диалог с тренером на месте')
    c.ok(await reaches(page.getByRole('link', { name: /^Менеджер по продажам/ })), 'и диалог с менеджером по продажам')
    c.ok(await reaches(page.getByRole('link', { name: /^Управляющий/ })), 'и диалог с управляющим')
    await screenshot(page, 'client-chat-list')
    await trainerRow.click()
    await page.waitForURL(`${ORIGIN}/me/chat/trainer`)
    await page.getByTestId('chat-input').fill(QUESTION)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: 'Посмотрите резинку' })), 'сообщение клиента в ленте справа')
    c.ok(chat.state.messages[0]?.body === QUESTION && chat.state.messages[0]?.author_side === 'client', 'на сервер ушло сообщение клиента')
    c.ok((await page.getByTestId('chat-input').inputValue()) === '', 'поле ввода очищено после отправки')
    await page.getByTestId('chat-emoji-toggle').click()
    const picker = page.getByTestId('chat-emoji-picker')
    await picker.getByRole('tab', { name: 'Жесты' }).click()
    await picker.getByRole('button', { name: '💪' }).click()
    c.ok((await page.getByTestId('chat-input').inputValue()) === '💪', 'смайлик из панели попал в поле ввода')
    await screenshot(page, 'client-chat-emoji')
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine.chat-msg--big', { hasText: '💪' })), 'одиночный смайлик — крупно, без пузыря')
    c.ok(!(await picker.isVisible()), 'после отправки панель смайликов закрылась')
    c.ok(await reaches(page.locator('.chat-day', { hasText: 'Сегодня' })), 'плашка дня «Сегодня»')
    await screenshot(page, 'client-chat-sent')
  } catch (e) {
    await screenshot(page, 'client-chat-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function trainerReplies(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения клуба: 1 новых' })), 'шапка тренера: конверт «1 новых» — сообщение клиента')
    await page.getByRole('link', { name: /^Сообщения клуба/ }).click()
    await page.getByRole('link', { name: 'Диалоги с клиентами' }).click()
    const row = page.getByTestId('chat-threads').getByRole('link', { name: new RegExp(CLIENT_NAME) })
    c.ok(await reaches(row.locator('.chat-row__badge', { hasText: '2' })), '«Диалоги»: у клиента кружок «2 новых»')
    await screenshot(page, 'staff-chat-list')
    await row.click()
    const link = page.locator('.chat-msg a', { hasText: 'wildberries.ru' })
    c.ok(await reaches(link), 'тренер видит сообщение клиента')
    c.ok((await link.getAttribute('href')) === WB && (await link.getAttribute('target')) === '_blank', 'ссылка Wildberries кликабельна и открывается отдельно')
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения клуба', exact: true })), 'открыл диалог — конверт без числа')
    await page.getByTestId('chat-input').fill(REPLY)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: REPLY })), 'ответ тренера в ленте')
    const saved = chat.state.messages.at(-1)
    c.ok(saved?.author_side === 'staff' && saved?.author_user_id === TRAINER_ID, 'на сервер ушёл ответ от имени тренера')
    await page.getByTestId('chat-emoji-toggle').click()
    await screenshot(page, 'staff-chat-stickers')
    await page.getByRole('button', { name: 'Отправить стикер «Отличная работа»' }).click()
    c.ok(await reaches(page.locator('.chat-msg--mine.chat-msg--sticker').getByRole('img', { name: 'Стикер: Отличная работа' })), 'стикер тренера в ленте')
    const sticker = chat.state.messages.at(-1)
    c.ok(sticker?.sticker === 'great' && sticker?.body === 'Отличная работа', 'на сервер ушёл стикер, текст — его подпись')
    await page.getByTestId('chat-emoji-toggle').click()
    await screenshot(page, 'staff-chat-thread')
    c.ok(pageErrors.length === 0, `без ошибок JS у тренера${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'staff-chat-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function clientReads(c, browser, backend) {
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
    c.ok(await reaches(page.getByRole('button', { name: 'Сообщения: новых 1' })), 'клиент: на конверте /me — 1 новое')
    await page.goto(`${ORIGIN}/me/chat/trainer`)
    const reply = page.locator('.chat-msg:not(.chat-msg--mine)', { hasText: REPLY })
    c.ok(await reaches(reply), 'клиент видит ответ тренера')
    const trainerName = backend.state.users.find((u) => u.id === TRAINER_ID)?.name
    c.ok(await reaches(reply.getByText(trainerName)), 'у ответа подписано имя тренера')
    c.ok(await reaches(page.locator('.chat-msg--mine .chat-msg__tick.is-read').first()), 'свои сообщения с двумя галочками — тренер прочитал')
    c.ok(await reaches(page.getByRole('img', { name: 'Стикер: Отличная работа' })), 'клиент видит стикер тренера')
    await screenshot(page, 'client-chat-reply')
  } catch (e) {
    await screenshot(page, 'client-chat-read-FAIL').catch(() => null)
    c.ok(false, `клиент (ответ): сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('client-chat')
  const backend = createFakeBackend(completedTodaySeed())
  const chat = createFakeChat(backend.state)
  wireClient(backend, chat)
  await clientWrites(c, browser, backend, chat)
  await trainerReplies(c, browser, backend, chat)
  wireClient(backend, chat)
  await clientReads(c, browser, backend)
  return c.failures
}
