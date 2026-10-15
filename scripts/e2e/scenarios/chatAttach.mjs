/**
 * Фото и PDF в переписке. Клиент на iPhone: скрепка → фото → превью над полем, подпись → ушло JPEG-ом (ужато на телефоне);
 * PDF — плашкой с именем; .txt — понятная ошибка; фото старше суток — «удалено»;
 * вставил прозрачную картинку (стикер с клавиатуры) — ушла стикером, в ленте без пузыря.
 * Тренер на планшете: видит фото клиента, тап — на весь экран, Esc — закрыл; PDF — скачался с тем же именем; отправил фото без подписи.
 * Бакет — подменный (fakeChat.mjs), ответы — настоящий chatAttachHandler.
 */
import { CHAT_ATTACH_BAD_RU } from '../../../src/lib/chat/chatAttachCore.js'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, TRAINER_LOGIN, TRAINER_PASSWORD, completedTodaySeed } from '../lib/fixtures.mjs'
import { wireClient } from './clientChat.mjs'

export const name = 'переписка: фото и PDF'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const INVITE = 'e2e-attach-invite'
/** PNG 1×1 + хвост после IEND: сервер не берёт файлы меньше 100 байт. */
const OLD_PNG = Buffer.concat([
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  Buffer.alloc(64),
]).toString('base64')
const PDF = Buffer.from(`%PDF-1.4\n%${'план '.repeat(20)}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`)

/** Фото, отправленное позавчера: файл уже удалён правилом бакета. */
function seedExpiredPhoto(chat) {
  chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', attach: { kind: 'photo', data: OLD_PNG, w: 1, h: 1 } })
  chat.state.messages.at(-1).created_at = new Date(Date.now() - 50 * 3600_000).toISOString()
}

/** «Снимок с камеры» 2400×1800 — больше лимита стороны, телефон должен ужать. */
async function cameraPng(page) {
  const b64 = await page.evaluate(() => {
    const c = globalThis.document.createElement('canvas')
    c.width = 2400
    c.height = 1800
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 2400, 1800)
    g.addColorStop(0, '#2b6cb0')
    g.addColorStop(1, '#f6ad55')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 2400, 1800)
    return c.toDataURL('image/png').split(',')[1]
  })
  return Buffer.from(b64, 'base64')
}

/** Стикер с клавиатуры через «Копировать → Вставить»: PNG 600×600 с прозрачным фоном — вставка в поле ввода. */
async function pasteTransparentPng(page) {
  await page.getByTestId('chat-input').evaluate(async (el) => {
    const c = globalThis.document.createElement('canvas')
    c.width = 600
    c.height = 600
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#f5b301'
    ctx.beginPath()
    ctx.arc(300, 300, 220, 0, Math.PI * 2)
    ctx.fill()
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    const dt = new globalThis.DataTransfer()
    dt.items.add(new globalThis.File([blob], 'sticker.png', { type: 'image/png' }))
    el.focus()
    el.dispatchEvent(new globalThis.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const attachCount = (chat) => chat.state.messages.filter((m) => m.attach_kind).length

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

async function eventually(check) {
  for (let i = 0; i < 50; i += 1) {
    if (await check()) return true
    await wait(100)
  }
  return false
}

async function client(c, context, chat) {
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/chat/trainer`)
    c.ok(await reaches(page.getByTestId('chat-attach-button')), 'клиент: в поле ввода есть скрепка')
    c.ok(await reaches(page.getByTestId('chat-attach-gone')), 'клиент: фото старше суток — «удалено через сутки»')

    const input = page.getByTestId('chat-attach-input')
    await input.setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('просто текст') })
    c.ok(await reaches(page.getByTestId('chat-attach-error').getByText(CHAT_ATTACH_BAD_RU)), 'клиент: .txt — понятная ошибка, не отправилось')
    c.ok(attachCount(chat) === 1, 'клиент: на сервер ничего не ушло')

    const before = attachCount(chat)
    await input.setInputFiles({ name: 'IMG_0001.png', mimeType: 'image/png', buffer: await cameraPng(page) })
    c.ok(await reaches(page.getByTestId('chat-attach-draft').locator('img')), 'клиент: выбрал фото — превью над полем')
    c.ok(await reaches(page.getByTestId('chat-send')), 'клиент: с фото — «Отправить» вместо 🎤')
    await page.getByTestId('chat-input').fill('Моя техника приседа')
    await screenshot(page, 'client-chat-attach-draft')
    await page.getByTestId('chat-send').click()
    c.ok(await eventually(() => attachCount(chat) === before + 1), 'клиент: фото ушло')
    const photo = chat.state.messages.at(-1)
    c.ok(photo.attach_mime === 'image/jpeg' && photo.attach_w === 1600 && photo.attach_h === 1200, 'клиент: на сервере JPEG, ужатый до 1600 px')
    c.ok(photo.body === '📷 Моя техника приседа' && photo.attach_caption === 'Моя техника приседа', 'клиент: подпись к фото; в списке и push — «📷 подпись»')
    c.ok(await reaches(page.getByTestId('chat-attach-draft'), 'hidden'), 'клиент: после отправки превью убрано')
    c.ok(await reaches(page.locator('.chat-msg--mine.chat-msg--photo').getByTestId('chat-attach-photo').locator('img')), 'клиент: своё фото в ленте')
    c.ok(await reaches(page.locator('.chat-msg--mine .chat-attach-caption').getByText('Моя техника приседа')), 'клиент: подпись под фото')

    await input.setInputFiles({ name: 'План питания.pdf', mimeType: 'application/pdf', buffer: PDF })
    c.ok(await reaches(page.getByTestId('chat-attach-draft').getByText('План питания.pdf')), 'клиент: PDF — плашка с именем над полем')
    await page.getByTestId('chat-send').click()
    c.ok(await eventually(() => attachCount(chat) === before + 2), 'клиент: PDF ушёл')
    const pdf = chat.state.messages.at(-1)
    c.ok(pdf.attach_kind === 'file' && pdf.attach_mime === 'application/pdf' && pdf.body === '📎 План питания.pdf', 'клиент: на сервере PDF с именем')
    c.ok(await reaches(page.locator('.chat-msg--mine').getByTestId('chat-attach-file').getByText('План питания.pdf')), 'клиент: PDF в ленте плашкой')

    await pasteTransparentPng(page)
    c.ok(await reaches(page.getByTestId('chat-attach-draft').getByText('Стикер', { exact: true })), 'клиент: вставил прозрачную картинку — над полем «Стикер»')
    await page.getByTestId('chat-send').click()
    c.ok(await eventually(() => attachCount(chat) === before + 3), 'клиент: стикер ушёл')
    const st = chat.state.messages.at(-1)
    c.ok(st.attach_kind === 'sticker' && /^image\/(webp|png)$/.test(st.attach_mime) && st.attach_w === 512, 'клиент: на сервере стикер WebP / PNG, ужатый до 512 px')
    c.ok(st.body === '🖼 Стикер' && String(st.attach_key).startsWith('chat-sticker/'), 'клиент: в списке «🖼 Стикер», файл вне автоудаления')
    const stickerMsg = page.locator('.chat-msg--mine.chat-msg--sticker')
    c.ok(await reaches(stickerMsg.getByTestId('chat-attach-sticker').locator('img')), 'клиент: стикер в ленте')
    const bg = await stickerMsg.last().evaluate((el) => globalThis.getComputedStyle(el).backgroundColor)
    c.ok(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent', 'клиент: стикер без пузыря')
    await screenshot(page, 'client-chat-attach-sent')
  } catch (e) {
    await screenshot(page, 'client-chat-attach-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

async function trainer(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.getByRole('link', { name: /^Сообщения клуба/ }).click()
    await page.getByTestId('chat-contacts').getByRole('link', { name: new RegExp(CLIENT_NAME) }).click()
    const peerPhoto = page.locator('.chat-msg:not(.chat-msg--mine)').getByTestId('chat-attach-photo').locator('img')
    c.ok(await reaches(peerPhoto.last()), 'тренер: видит фото клиента')
    c.ok(await reaches(page.locator('.chat-msg:not(.chat-msg--mine)').getByTestId('chat-attach-sticker').locator('img').last()), 'тренер: видит стикер клиента')
    await screenshot(page, 'staff-chat-attach-feed')

    await peerPhoto.last().click()
    c.ok(await reaches(page.getByTestId('chat-photo-viewer')), 'тренер: тап по фото — на весь экран')
    await screenshot(page, 'staff-chat-photo-viewer')
    await page.keyboard.press('Escape')
    c.ok(await reaches(page.getByTestId('chat-photo-viewer'), 'hidden'), 'тренер: Esc — закрыл')
    c.ok((await page.getByTestId('chat-react-menu').count()) === 0, 'тренер: просмотр фото не открыл меню сообщения')

    const download = page.waitForEvent('download', { timeout: 10_000 })
    await page.locator('.chat-msg:not(.chat-msg--mine)').getByTestId('chat-attach-file').last().click()
    c.ok((await download).suggestedFilename() === 'План питания.pdf', 'тренер: тап по PDF — скачался с тем же именем')

    const before = attachCount(chat)
    await page.getByTestId('chat-attach-input').setInputFiles({ name: 'plan.png', mimeType: 'image/png', buffer: await cameraPng(page) })
    c.ok(await reaches(page.getByTestId('chat-attach-draft').locator('img')), 'тренер: выбрал фото — превью')
    await page.getByTestId('chat-send').click()
    c.ok(await eventually(() => attachCount(chat) === before + 1), 'тренер: фото без подписи ушло')
    c.ok(chat.state.messages.at(-1).body === '📷 Фото', 'тренер: без подписи в списке и push — «📷 Фото»')
  } catch (e) {
    await screenshot(page, 'staff-chat-attach-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('chat-attach')
  const backend = createFakeBackend(completedTodaySeed())
  const chat = createFakeChat(backend.state)
  wireClient(backend, chat, INVITE)
  seedExpiredPhoto(chat)
  const phone = await newE2eContext(browser, backend, IPHONE)
  try {
    await client(c, phone, chat)
    await trainer(c, browser, backend, chat)
  } finally {
    await phone.close()
  }
  return c.failures
}
