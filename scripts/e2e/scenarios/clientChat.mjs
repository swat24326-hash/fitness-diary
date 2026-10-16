/**
 * Переписка клиента с тренером: клиент на iPhone пишет тренеру ссылку Wildberries →
 * у тренера на планшете конверт «1 новых» → мессенджер, папка «Клиенты» → ссылка кликабельна → ответ →
 * конверт гаснет → клиент видит ответ с именем тренера и число на вкладке «Сообщения» /me.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { ORIGIN, chatComposeAtBottom, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'

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
const REPLY = 'Подойдёт, берите среднюю жёсткость или ozon.ru/t/abc, вопросы — 8 999 123-45-67'

/** Подменяет Web Audio счётчиком: сколько тонов сыграли звуки переписки. */
async function spySounds(page) {
  await page.addInitScript(() => {
    globalThis.__chatTones = 0
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
    const node = () => ({ connect: (n) => n, frequency: param, gain: param, Q: param, start() {}, stop() {} })
    globalThis.AudioContext = class {
      state = 'running'
      currentTime = 0
      sampleRate = 44100
      destination = {}
      createBuffer(_ch, length) {
        return { getChannelData: () => new Float32Array(length) }
      }
      createBufferSource() {
        globalThis.__chatTones += 1
        return node()
      }
      createBiquadFilter() {
        return node()
      }
      resume() {
        return Promise.resolve()
      }
      createOscillator() {
        globalThis.__chatTones += 1
        return node()
      }
      createGain() {
        return node()
      }
    }
  })
}

const tones = (page) => page.evaluate(() => globalThis.__chatTones)

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

/** Ответ сервера приходит после мгновенного показа — ждём, а не смотрим сразу. */
async function eventually(check) {
  for (let i = 0; i < 50; i += 1) {
    if (check()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

export function wireClient(backend, chat, inviteToken = INVITE) {
  const portal = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken, today: isoDay(0) })
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
  await spySounds(page)
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/inbox`)
    const trainerRow = page.getByRole('link', { name: /^Тренер · / })
    c.ok(await reaches(trainerRow), '«Сообщения»: диалог с тренером на месте')
    c.ok(await reaches(page.getByRole('link', { name: /^Менеджер по продажам/ })), 'и диалог с менеджером по продажам')
    c.ok(await reaches(page.getByRole('link', { name: /^Жалобы и предложения/ })), 'и «Жалобы и предложения» (читает управляющий)')
    await screenshot(page, 'client-chat-list')
    c.ok((await page.getByRole('link', { name: /^От клуба/ }).count()) === 0, 'вкладки «От клуба» в Сообщениях больше нет')
    await page.goto(`${ORIGIN}/me/inbox?tab=news`)
    await page.waitForURL(`${ORIGIN}/me/notifications`, { timeout: 10_000 })
    c.ok(await reaches(page.getByRole('heading', { name: 'Уведомления' })), 'старый tab=news → лента уведомлений')
    await screenshot(page, 'client-notifications-from-news-redirect')
    await page.goto(`${ORIGIN}/me/inbox`)
    await trainerRow.click()
    await page.waitForURL(`${ORIGIN}/me/chat/trainer`)
    c.ok(
      (await reaches(page.locator('.client-me__top .chat-bar').getByRole('link', { name: 'К списку' }))) &&
        (await page.locator('.client-me__top').count()) === 1 &&
        (await page.locator('.client-me__brand').count()) === 0,
      'диалог: одна шапка диалога со «←» вместо шапки клуба, как в Telegram',
    )
    await page.getByTestId('chat-input').fill(QUESTION)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: 'Посмотрите резинку' })), 'сообщение клиента в ленте справа')
    c.ok(chat.state.messages[0]?.body === QUESTION && chat.state.messages[0]?.author_side === 'client', 'на сервер ушло сообщение клиента')
    c.ok(await chatComposeAtBottom(page), 'поле ввода у нижнего края экрана')
    c.ok((await page.getByTestId('chat-input').inputValue()) === '', 'поле ввода очищено после отправки')
    c.ok(!(await page.getByTestId('chat-counter').isVisible()), 'короткий текст — счётчика символов нет')
    await page.getByTestId('chat-input').fill('я'.repeat(1950))
    c.ok((await page.getByTestId('chat-counter').innerText()) === '1950 / 2000', 'у предела — счётчик «1950 / 2000»')
    await page.getByTestId('chat-input').fill('')
    c.ok((await tones(page)) > 0, 'клиент: звук отправки (у клиента звуки включены по умолчанию)')
    await page.getByTestId('chat-emoji-toggle').click()
    const picker = page.getByTestId('chat-emoji-picker')
    await picker.getByRole('tab', { name: 'Смайлы и люди' }).click()
    c.ok((await picker.locator('.chat-emoji__item').count()) > 200, 'панель: набор как в Telegram')
    await picker.getByRole('button', { name: '💪' }).scrollIntoViewIfNeeded()
    c.ok(await reaches(picker.getByRole('button', { name: '💪' }).locator('img.chat-emoji-glyph')), 'панель: смайлик картинкой Noto')
    c.ok((await picker.getByRole('tab').count()) >= 9, 'панель: разделы — стикеры, смайлы, природа, еда, спорт…')
    await picker.getByRole('button', { name: '💪' }).click()
    c.ok((await page.getByTestId('chat-input').inputValue()) === '💪', 'смайлик из панели попал в поле ввода')
    await screenshot(page, 'client-chat-emoji')
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine.chat-msg--big [role="img"][aria-label="💪"]')), 'одиночный смайлик — крупно, без пузыря')
    const lottieSvg = page.locator('.chat-msg--big .chat-emoji-anim__player svg')
    c.ok(await reaches(lottieSvg), 'крупный смайлик — анимация Lottie, как в Telegram')
    c.ok(((await lottieSvg.boundingBox())?.width ?? 0) >= 120, 'анимация во всю рамку (128px)')
    c.ok(!(await picker.isVisible()), 'после отправки панель смайликов закрылась')
    await page.getByTestId('chat-emoji-toggle').click()
    const frequentTab = picker.getByRole('tab', { name: 'Часто используемые' })
    c.ok((await frequentTab.getAttribute('aria-selected')) === 'true', 'панель открывается на «Часто используемые»')
    const frequent = picker.getByRole('tabpanel', { name: 'Часто используемые' }).locator('.chat-emoji__item')
    c.ok((await frequent.first().getAttribute('aria-label')) === '💪' && (await frequent.count()) === 24, 'отправленный 💪 — первым, вкладка заполнена (24)')
    await screenshot(page, 'client-chat-emoji-frequent')
    await page.getByTestId('chat-emoji-toggle').click()
    c.ok(await reaches(page.locator('.chat-day', { hasText: 'Сегодня' })), 'плашка дня «Сегодня»')
    // Полоса дня на всю ширину с фоном: иначе липкая «Вчера» короче «1 октября» и по краям торчат цифры (INC-2026-10-16-01).
    c.ok(
      await page.locator('.chat-day').first().evaluate((el) => {
        const row = globalThis.getComputedStyle(el)
        const feed = el.closest('.chat-thread__feed')
        const bg = row.backgroundColor
        const solid = Boolean(bg && bg !== 'transparent' && !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(bg))
        // Лента с padding 10px: полоса дня тянется на ширину содержимого, не на clientWidth ленты.
        const inner = (feed?.clientWidth ?? 0) - 24
        return row.position === 'sticky' && el.clientWidth >= inner && solid
      }),
      'плашка дня: полоса на всю ширину ленты с фоном — закрывает предыдущую дату',
    )
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
  await spySounds(page)
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения клуба: 1 новых' })), 'шапка тренера: конверт «1 новых» — сообщение клиента')
    await page.getByRole('link', { name: /^Сообщения клуба/ }).click()
    const clientsTab = page.getByTestId('chat-folders').getByRole('button', { name: /^Клиенты/ })
    c.ok(await reaches(clientsTab), 'конверт открыл мессенджер, без вкладки «Диалоги»')
    c.ok((await clientsTab.getAttribute('aria-pressed')) === 'true', 'новое от клиента — открыта папка «Клиенты»')
    const row = page.getByTestId('chat-contacts').getByRole('link', { name: new RegExp(CLIENT_NAME) })
    c.ok(await reaches(row.locator('.chat-row__badge', { hasText: '2' })), '«Клиенты»: у клиента кружок «2 новых»')
    await screenshot(page, 'staff-chat-list')
    await row.click()
    const link = page.locator('.chat-msg a', { hasText: 'wildberries.ru' })
    c.ok(await reaches(link), 'тренер видит сообщение клиента')
    c.ok(
      (await row.getAttribute('aria-current')) === 'true' && (await page.getByTestId('chat-folders').isVisible()),
      'планшет: диалог справа, слева список с подсвеченным клиентом — как Telegram',
    )
    c.ok((await link.getAttribute('href')) === WB && (await link.getAttribute('target')) === '_blank', 'ссылка Wildberries кликабельна и открывается отдельно')
    let popups = 0
    context.on('page', () => (popups += 1))
    await link.click()
    const ask = page.getByRole('dialog', { name: 'Открыть ссылку?' })
    c.ok(await reaches(ask), 'ссылка клиента: сначала «Открыть ссылку?»')
    c.ok(await reaches(ask.getByText('www.wildberries.ru', { exact: true })), 'в окне крупно настоящий сайт')
    await screenshot(page, 'staff-chat-link-confirm')
    await ask.getByRole('button', { name: 'Отмена' }).click()
    c.ok((await reaches(ask, 'hidden')) && popups === 0, '«Отмена» — окно закрылось, сайт не открылся')
    await link.click()
    const popup = context.waitForEvent('page', { timeout: 10_000 })
    await ask.getByRole('button', { name: 'Открыть' }).click()
    c.ok(Boolean(await popup.catch(() => null)) && (await reaches(ask, 'hidden')), '«Открыть» — сайт в новой вкладке')
    for (const p of context.pages()) if (p !== page) await p.close()
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения клуба', exact: true })), 'открыл диалог — конверт без числа')
    const question = page.locator('.chat-msg:not(.chat-msg--mine)', { hasText: 'Посмотрите резинку' })
    await question.click({ button: 'right', position: { x: 12, y: 8 } })
    const menu = page.getByTestId('chat-react-menu')
    c.ok(await reaches(menu), 'правая кнопка (на телефоне — долгое нажатие) по сообщению — меню реакций')
    c.ok((await menu.getByRole('menuitem').count()) === 8, 'в меню 6 реакций, «Ответить» и «Копировать»')
    await screenshot(page, 'staff-chat-react-menu')
    await menu.getByRole('menuitem', { name: 'Реакция ❤️' }).click()
    c.ok(await reaches(question.getByRole('button', { name: /^Убрать реакцию ❤️/ })), 'под сообщением клиента — плашка ❤️ тренера')
    c.ok(
      await eventually(() => chat.state.reactions.some((r) => r.emoji === '❤️' && r.reactor === `u:${TRAINER_ID}`)),
      'на сервер ушла реакция от имени тренера',
    )
    c.ok(await reaches(page.getByTestId('chat-react-menu'), 'hidden'), 'после выбора меню закрылось')
    const clientName = backend.state.clients.find((x) => x.id === CLIENT_ID)?.name
    await question.click({ button: 'right', position: { x: 12, y: 8 } })
    await page.getByTestId('chat-react-menu').getByRole('menuitem', { name: 'Ответить' }).click()
    const draft = page.getByTestId('chat-reply-draft')
    c.ok(await reaches(draft.getByText(`Ответ ${clientName}`)), '«Ответить» — над полем «Ответ <клиент>» и цитата, как в Telegram')
    c.ok(await reaches(draft.getByText(/Посмотрите резинку/)), 'в полоске — начало сообщения клиента')
    c.ok(await page.getByTestId('chat-input').evaluate((el) => el === el.ownerDocument.activeElement), 'курсор сразу в поле ввода')
    await page.getByTestId('chat-input').fill(REPLY)
    await screenshot(page, 'staff-chat-reply-draft')
    await page.getByTestId('chat-send').click()
    const sent = page.locator('.chat-msg--mine', { hasText: REPLY })
    c.ok(await reaches(sent), 'ответ тренера в ленте')
    c.ok(await reaches(sent.getByTestId('chat-reply-quote').getByText(clientName)), 'над ответом — цитата с именем клиента')
    c.ok(await reaches(draft, 'hidden'), 'отправил — полоска «Ответ» исчезла')
    const saved = chat.state.messages.at(-1)
    c.ok(saved?.author_side === 'staff' && saved?.author_user_id === TRAINER_ID, 'на сервер ушёл ответ от имени тренера')
    const asked = chat.state.messages.find((m) => m.author_side === 'client' && String(m.body).startsWith('Посмотрите резинку'))
    c.ok(saved?.reply_to === asked?.id, 'на сервере ответ помнит, на какое сообщение')
    c.ok((await tones(page)) === 0, 'планшет молчит: у сотрудника звуки выключены по умолчанию')
    await page.getByTestId('chat-emoji-toggle').click()
    await page.getByTestId('chat-emoji-picker').getByRole('tab', { name: 'Стикеры' }).click()
    await screenshot(page, 'staff-chat-stickers')
    await page.getByRole('button', { name: 'Отправить стикер «Отличная работа»' }).click()
    c.ok(await reaches(page.locator('.chat-msg--mine.chat-msg--sticker').getByRole('img', { name: 'Стикер: Отличная работа' })), 'стикер тренера в ленте')
    const sticker = chat.state.messages.at(-1)
    c.ok(sticker?.sticker === 'great' && sticker?.body === 'Отличная работа', 'на сервер ушёл стикер, текст — его подпись')
    await page.getByTestId('chat-emoji-toggle').click()
    await page.getByTestId('chat-emoji-toggle').click()
    await page.getByTestId('chat-emoji-picker').getByRole('tab', { name: 'Стикеры' }).click()
    await page.getByRole('button', { name: 'Отправить стикер «Замешиваю протеин»' }).click()
    const art = page.locator('.chat-msg--mine.chat-msg--sticker').getByRole('img', { name: 'Стикер: Замешиваю протеин' })
    c.ok(await reaches(art), 'анимированный стикер набора «Зал» в ленте')
    c.ok((await art.locator('image').first().getAttribute('href'))?.endsWith('/stickers/art/shake.webp'), 'рисунок стикера — файл из public/stickers/art')
    c.ok(chat.state.messages.at(-1)?.sticker === 'shake', 'на сервер ушёл id анимированного стикера')
    await screenshot(page, 'staff-chat-art-sticker')
    await page.getByTestId('chat-emoji-toggle').click()
    await screenshot(page, 'staff-chat-thread')
    c.ok(pageErrors.length === 0, `без ошибок JS у тренера${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
    const foreign = { id: 'e2e00000-0000-4000-8000-0000000000f9', name: 'Чужой Клиент', club_id: CLUB_ID, trainer_id: 'e2e-other-trainer' }
    backend.state.clients.push(foreign)
    await page.goto(`${ORIGIN}/messages/chat/${foreign.id}/trainer`)
    c.ok(await reaches(page.getByRole('link', { name: 'К диалогам' })), 'чужой клиент: «Нет доступа» — кнопка «К диалогам», а не бесполезный «Повторить»')
    backend.state.clients.pop()
  } catch (e) {
    await screenshot(page, 'staff-chat-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function clientReads(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения: новых 1' })), 'клиент: на вкладке «Сообщения» /me — 1 новое')
    await page.goto(`${ORIGIN}/me/inbox`)
    const trainerRow = page.getByRole('link', { name: /^Тренер · / })
    c.ok(await reaches(trainerRow.getByTestId('chat-row-reaction')), 'список диалогов: значок ❤️ — тренер отреагировал на сообщение')
    await screenshot(page, 'client-chat-list-reaction')
    await trainerRow.click()
    await page.waitForURL(`${ORIGIN}/me/chat/trainer`)
    const reply = page.locator('.chat-msg:not(.chat-msg--mine)', { hasText: REPLY })
    c.ok(await reaches(reply), 'клиент видит ответ тренера')
    const trainerName = backend.state.users.find((u) => u.id === TRAINER_ID)?.name
    c.ok(await reaches(reply.getByText(trainerName)), 'у ответа подписано имя тренера')
    c.ok((await reply.locator('a', { hasText: 'ozon.ru/t/abc' }).getAttribute('href')) === 'https://ozon.ru/t/abc', 'сайт без https:// в ответе — кликабелен')
    const tel = reply.locator('a', { hasText: '8 999 123-45-67' })
    c.ok((await tel.getAttribute('href')) === 'tel:+79991234567' && !(await tel.getAttribute('target')), 'телефон в ответе — звонок, без новой вкладки')
    c.ok(await reaches(page.locator('.chat-msg--mine .chat-msg__tick.is-read').first()), 'свои сообщения с двумя галочками — тренер прочитал')
    c.ok(await reaches(page.getByRole('img', { name: 'Стикер: Отличная работа' })), 'клиент видит стикер тренера')
    const mineQuestion = page.locator('.chat-msg--mine', { hasText: 'Посмотрите резинку' })
    const heart = mineQuestion.getByRole('button', { name: /^Поставить ❤️/ })
    c.ok(await reaches(heart), 'клиент видит ❤️ тренера под своим сообщением')
    c.ok((await heart.getAttribute('title')) === trainerName, 'по наведению (на телефоне — удержанию) видно, кто поставил')
    await heart.click({ button: 'right' })
    c.ok(await reaches(mineQuestion.getByRole('tooltip', { name: trainerName })), 'удержание плашки — подсказка с именем тренера')

    const quote = reply.getByTestId('chat-reply-quote')
    c.ok(await reaches(quote.getByText('Вы', { exact: true })), 'клиент видит цитату своего вопроса над ответом тренера («Вы»)')
    await quote.click()
    c.ok(await reaches(page.locator('.chat-msg.is-flash', { hasText: 'Посмотрите резинку' })), 'нажал цитату — исходное сообщение подсвечено')

    const replyBody = reply.locator('.chat-msg__body')
    const box = await replyBody.boundingBox()
    await replyBody.dblclick({ position: { x: 8, y: Math.round(box.height - 12) } })
    const thumb = reply.getByRole('button', { name: /^Убрать реакцию 👍/ })
    c.ok(await reaches(thumb), 'двойной тап по сообщению — сразу 👍, как в Telegram')
    c.ok(await reaches(reply.locator('.chat-reactions__burst')), 'новая реакция — «взрыв» анимированного смайлика')
    await screenshot(page, 'client-chat-reactions')

    await reply.click({ button: 'right', position: { x: 12, y: 8 } })
    const menu = page.getByTestId('chat-react-menu')
    await menu.getByRole('button', { name: 'Все смайлики' }).click()
    c.ok(await reaches(page.getByTestId('chat-react-all')), 'стрелка «ещё» — весь набор смайликов')
    await screenshot(page, 'client-chat-react-all')
    await menu.getByRole('menuitem', { name: 'Реакция 🍕' }).click()
    const pizza = reply.getByRole('button', { name: /^Убрать реакцию 🍕/ })
    c.ok((await reaches(pizza)) && !(await thumb.isVisible()), 'выбрал из набора 🍕 — заменила 👍 (одна реакция от человека)')
    c.ok(await eventually(() => chat.state.reactions.some((r) => r.reactor.startsWith('c:') && r.emoji === '🍕')), 'на сервере у клиента 🍕')
    await pizza.click()
    c.ok(await reaches(reply.getByTestId('chat-reactions'), 'hidden'), 'тап по своей плашке — реакция снята')
    c.ok(await eventually(() => !chat.state.reactions.some((r) => r.reactor.startsWith('c:'))), 'на сервере реакции клиента больше нет')

    await reply.click({ button: 'right', position: { x: 12, y: 8 } })
    await page.getByTestId('chat-react-menu').getByRole('menuitem', { name: 'Ответить' }).click()
    const draft = page.getByTestId('chat-reply-draft')
    c.ok(await reaches(draft.getByText(`Ответ ${trainerName}`)), 'клиент: «Ответить» — над полем «Ответ <тренер>»')
    await page.getByTestId('chat-input').press('Escape')
    c.ok(await reaches(draft, 'hidden'), 'Esc — передумал отвечать, полоска исчезла')
    await reply.click({ button: 'right', position: { x: 12, y: 8 } })
    await page.getByTestId('chat-react-menu').getByRole('menuitem', { name: 'Ответить' }).click()
    await page.getByTestId('chat-input').fill('Спасибо, беру!')
    await page.getByTestId('chat-send').click()
    const thanks = page.locator('.chat-msg--mine', { hasText: 'Спасибо, беру!' })
    c.ok(await reaches(thanks.getByTestId('chat-reply-quote').getByText(trainerName)), 'ответ клиента — с цитатой тренера')
    const reqReply = chat.state.messages.at(-1)
    c.ok(reqReply?.author_side === 'client' && reqReply?.reply_to === chat.state.messages.find((m) => m.body === REPLY)?.id, 'на сервере ответ клиента помнит сообщение тренера')
    await screenshot(page, 'client-chat-reply')

    chat.state.pageSize = 2
    try {
      await page.reload()
      const thanksAgain = page.locator('.chat-msg--mine', { hasText: 'Спасибо, беру!' })
      c.ok(await reaches(thanksAgain), 'короткие страницы: открыл диалог — видно только последние сообщения')
      const trainerReply = page.locator('.chat-msg:not(.chat-msg--mine)', { hasText: REPLY })
      c.ok((await trainerReply.count()) === 0, 'ответа тренера ещё нет на экране — он старше')
      await thanksAgain.getByTestId('chat-reply-quote').click()
      c.ok(
        await reaches(page.locator('.chat-msg.is-flash:not(.chat-msg--mine)', { hasText: REPLY })),
        'нажал цитату старого сообщения — история догрузилась, лента у исходного, оно подсвечено',
      )
      await screenshot(page, 'client-chat-reply-found-older')
      const back = page.getByTestId('chat-jump-back')
      c.ok(await reaches(back), 'после перехода к старому — круглая «↓ назад к ответу», как в Telegram')
      await screenshot(page, 'client-chat-jump-back')
      await back.click()
      c.ok(await reaches(page.locator('.chat-msg--mine.is-flash', { hasText: 'Спасибо, беру!' })), '«назад» — лента снова у ответа, откуда уходили')
      c.ok(await reaches(back, 'hidden'), 'вернулся — кнопка «назад» пропала')

      await page.reload()
      c.ok(await reaches(thanksAgain), 'поиск: снова только последние сообщения')
      const head = page.locator('.client-me__top .chat-bar')
      c.ok((await head.locator('.chat-bar__menu ~ *').count()) === 0 && (await head.getByRole('button', { name: 'Меню' }).count()) === 0, 'шапка диалога: справа одна «⋮», без лупы и ☰')
      await head.getByRole('button', { name: 'Ещё' }).click()
      const more = page.getByRole('region', { name: 'Действия с диалогом' })
      c.ok(await reaches(more.getByRole('button', { name: 'Выйти' })), '«⋮»: поиск и пункты меню клиента — «Обновить», «Выйти»')
      await screenshot(page, 'client-chat-more-menu')
      await more.getByRole('button', { name: 'Поиск по переписке' }).click()
      const input = page.getByTestId('chat-search-input')
      c.ok(await reaches(input), 'лупа — вместо поля ввода строка поиска')
      c.ok((await page.getByTestId('chat-input').count()) === 0, 'пока ищем, поля «Сообщение» нет')
      await input.fill('резинк')
      c.ok(await reaches(page.getByTestId('chat-search-count').getByText('1 из 1')), 'нашлось «1 из 1» — вопрос про резинку')
      const found = page.locator('.chat-msg--mine', { hasText: 'Посмотрите резинку' })
      c.ok(await reaches(found.locator('mark.chat-search-hit')), 'старое сообщение догрузилось, найденное слово подсвечено')
      await screenshot(page, 'client-chat-search')
      await input.fill('жестк')
      c.ok(await reaches(page.locator('.chat-msg:not(.chat-msg--mine) mark.chat-search-hit', { hasText: 'жёстк' })), '«жестк» находит «жёсткость» — ё и е без разницы')
      await input.fill('гантели')
      c.ok(await reaches(page.getByTestId('chat-search-count').getByText('Ничего не нашлось')), 'нет такого слова — «Ничего не нашлось»')
      await page.getByRole('button', { name: 'Закрыть поиск' }).click()
      c.ok(await reaches(page.getByTestId('chat-input')), 'закрыл поиск — снова поле «Сообщение»')
      c.ok((await page.locator('mark.chat-search-hit').count()) === 0, 'подсветка найденного убрана')
    } finally {
      chat.state.pageSize = undefined
    }
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
  await clientReads(c, browser, backend, chat)
  return c.failures
}
