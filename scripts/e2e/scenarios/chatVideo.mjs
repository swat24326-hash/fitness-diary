/**
 * Видеокружки в переписке, как в Telegram. Клиент на iPhone (палец): короткое касание 🎤 — 📹; держит — снимается
 * кружок (живая камера в круге), отпустил — ушло; влево — отмена; вверх — без рук → «Отправить»; камера запрещена —
 * понятная ошибка; ещё касание — снова 🎤. Кружок старше суток — «удалено», длительность осталась.
 * Тренер на планшете (палец): видит кружки клиента, тап — со звуком; сам снимает и отправляет кружок.
 * Камера — подставной холст + тон, бакет — подменный (fakeChat.mjs), бинарная отправка — настоящий chatVideoHandler.
 */
import { CHAT_VIDEO_DENIED_RU, CHAT_VIDEO_EXPIRED_RU, CHAT_VIDEO_MODE_RU, CHAT_VOICE_MODE_RU } from '../../../src/lib/chat/chatVideoCore.js'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, TRAINER_LOGIN, TRAINER_PASSWORD, completedTodaySeed } from '../lib/fixtures.mjs'
import { wireClient } from './clientChat.mjs'

export const name = 'переписка: видеокружки'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const INVITE = 'e2e-video-invite'

/**
 * Камера = анимированный холст + тон 440 Гц; __camOn — сколько камер / микрофонов включено, __camDenied — «Запретить».
 * Без video в запросе — только звук, как у настоящего телефона (голосовое пишет MediaRecorder только со звуком).
 */
async function fakeCamera(page) {
  await page.addInitScript(() => {
    globalThis.__camOn = 0
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (globalThis.__camDenied) throw new DOMException('Permission denied', 'NotAllowedError')
      if (!constraints?.video) {
        const ctx = new globalThis.AudioContext()
        const osc = ctx.createOscillator()
        const dest = ctx.createMediaStreamDestination()
        osc.connect(dest)
        osc.start()
        globalThis.__camOn += 1
        const track = dest.stream.getAudioTracks()[0]
        const stop = track.stop.bind(track)
        track.stop = () => {
          stop()
          globalThis.__camOn -= 1
          void ctx.close()
        }
        return dest.stream
      }
      const canvas = Object.assign(globalThis.document.createElement('canvas'), { width: 240, height: 240 })
      const g = canvas.getContext('2d')
      let frame = 0
      const draw = setInterval(() => {
        frame += 1
        g.fillStyle = `hsl(${(frame * 9) % 360} 70% 50%)`
        g.fillRect(0, 0, 240, 240)
        g.fillStyle = '#fff'
        g.fillRect((frame * 6) % 240, 100, 40, 40)
      }, 40)
      const stream = canvas.captureStream(25)
      const ctx = new globalThis.AudioContext()
      const osc = ctx.createOscillator()
      const dest = ctx.createMediaStreamDestination()
      osc.connect(dest)
      osc.start()
      stream.addTrack(dest.stream.getAudioTracks()[0])
      globalThis.__camOn += 1
      let live = stream.getTracks().length
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track)
        track.stop = () => {
          stop()
          live -= 1
          if (live !== 0) return
          globalThis.__camOn -= 1
          clearInterval(draw)
          void ctx.close()
        }
      }
      return stream
    }
  })
}

/** Кружок тренера, снятый позавчера: файл уже удалён правилом бакета. */
function seedExpiredVideo(chat) {
  const buffer = Buffer.alloc(2000)
  Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).copy(buffer)
  chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', attach: { kind: 'video', buffer, sec: 12 } })
  chat.state.messages.at(-1).created_at = new Date(Date.now() - 50 * 3600_000).toISOString()
}

const camOn = (page) => page.evaluate(() => globalThis.__camOn)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const videos = (chat, side) => chat.state.messages.filter((m) => m.attach_kind === 'video' && m.author_side === side)

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

async function eventually(check, tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    if (await check()) return true
    await wait(100)
  }
  return false
}

/** Палец на кнопке — настоящие касания (CDP), как на телефоне: pointerType touch. */
async function finger(page, cdp, testId) {
  const box = await page.getByTestId(testId).boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const at = (dx = 0, dy = 0) => [{ x: x + dx, y: y + dy }]
  return {
    down: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at() }),
    async slide(dx, dy) {
      for (let i = 1; i <= 4; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at((dx * i) / 4, (dy * i) / 4) })
        await wait(30)
      }
    },
    up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  }
}

/** Короткое касание: подставная камера включается не мгновенно — не ждём её, как и живой палец. */
async function tap(page, cdp, testId) {
  const f = await finger(page, cdp, testId)
  const down = f.down()
  await wait(80)
  await Promise.all([down, f.up()])
}

async function client(c, context, chat) {
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await fakeCamera(page)
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/chat/trainer`)
    c.ok(await reaches(page.getByTestId('chat-mic')), 'клиент: поле пустое — справа 🎤')
    c.ok(await reaches(page.getByTestId('chat-video-gone').getByText(new RegExp(CHAT_VIDEO_EXPIRED_RU))), 'клиент: кружок старше суток — «удалено»')
    c.ok((await page.getByTestId('chat-video-gone').innerText()).includes('0:12'), 'клиент: у удалённого кружка длительность осталась')

    await tap(page, cdp, 'chat-mic')
    c.ok(await reaches(page.getByTestId('chat-voice-hint').getByText(CHAT_VIDEO_MODE_RU)), 'клиент: короткое касание 🎤 — режим 📹 с подсказкой')
    c.ok(await reaches(page.getByTestId('chat-video-button')), 'клиент: справа 📹')
    c.ok(await eventually(async () => (await camOn(page)) === 0), 'клиент: после касания камера выключена')

    const before = videos(chat, 'client').length
    let f = await finger(page, cdp, 'chat-video-button')
    await f.down()
    c.ok(await reaches(page.getByTestId('chat-video-holding')), 'клиент: держит — идёт запись, «‹ Влево — отмена»')
    c.ok(await reaches(page.locator('.chat-video-rec__live')), 'клиент: над полем круг с живой камерой')
    c.ok(!(await page.getByTestId('chat-input').isVisible()), 'клиент: поле на время записи спрятано')
    await wait(2000)
    c.ok((await page.getByTestId('chat-video-time').innerText()) >= '0:01', 'клиент: таймер идёт')
    await screenshot(page, 'client-chat-video-holding')
    await f.up()
    c.ok(await eventually(() => videos(chat, 'client').length === before + 1, 100), 'клиент: отпустил — кружок ушёл')
    const sent = videos(chat, 'client').at(-1)
    c.ok(
      sent?.attach_sec >= 1 && sent.body.startsWith('📹 Видеосообщение') && /^video\/(webm|mp4)$/.test(sent.attach_mime),
      'клиент: на сервере видео, длительность и подпись для списка',
    )
    c.ok(await reaches(page.locator('.chat-msg--mine').getByTestId('chat-video').last()), 'клиент: кружок в ленте')
    c.ok(await reaches(page.locator('.chat-msg--mine').getByTestId('chat-video').last().locator('video')), 'клиент: свой кружок загрузился и крутится')
    c.ok(await eventually(async () => (await camOn(page)) === 0), 'клиент: после отправки камера выключена')
    c.ok(await reaches(page.getByTestId('chat-video-button')), 'клиент: режим 📹 остался для следующего кружка')
    await screenshot(page, 'client-chat-video-sent')

    f = await finger(page, cdp, 'chat-video-button')
    await f.down()
    c.ok(await reaches(page.getByTestId('chat-video-holding')), 'клиент: снова держит')
    await wait(700)
    await f.slide(-130, 0)
    c.ok(await reaches(page.getByTestId('chat-video-holding'), 'hidden'), 'клиент: увёл палец влево — запись отменена')
    await f.up()
    await wait(400)
    c.ok(videos(chat, 'client').length === before + 1, 'клиент: отменённое не отправилось')
    c.ok(await eventually(async () => (await camOn(page)) === 0), 'клиент: после отмены камера выключена')

    f = await finger(page, cdp, 'chat-video-button')
    await f.down()
    await wait(500)
    await f.slide(0, -100)
    c.ok(await reaches(page.getByTestId('chat-video-locked')), 'клиент: палец вверх — запись без рук')
    await f.up()
    await wait(1300)
    c.ok(await page.getByTestId('chat-video-locked').isVisible(), 'клиент: отпустил палец — запись идёт дальше')
    await screenshot(page, 'client-chat-video-locked')
    await page.getByTestId('chat-voice-send').click()
    c.ok(await eventually(() => videos(chat, 'client').length === before + 2, 100), 'клиент: «Отправить» — ушёл кружок без рук')

    await page.evaluate(() => (globalThis.__camDenied = true))
    f = await finger(page, cdp, 'chat-video-button')
    await f.down()
    await wait(600)
    await f.up()
    c.ok(await reaches(page.getByTestId('chat-voice-error').getByText(CHAT_VIDEO_DENIED_RU)), 'клиент: камера запрещена — понятная подсказка')
    await screenshot(page, 'client-chat-video-denied')
    await page.evaluate(() => (globalThis.__camDenied = false))

    await tap(page, cdp, 'chat-video-button')
    c.ok(await reaches(page.getByTestId('chat-mic')), 'клиент: короткое касание 📹 — снова 🎤')
    c.ok(await reaches(page.getByTestId('chat-voice-hint').getByText(CHAT_VOICE_MODE_RU)), 'клиент: подсказка «Голосовое: удерживайте 🎤»')
    c.ok(await eventually(async () => (await camOn(page)) === 0), 'клиент: камера не осталась включённой')
  } catch (e) {
    await screenshot(page, 'client-chat-video-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

async function trainer(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await fakeCamera(page)
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.getByRole('link', { name: /^Сообщения клуба/ }).click()
    await page.getByTestId('chat-contacts').getByRole('link', { name: new RegExp(CLIENT_NAME) }).click()
    const peer = page.locator('.chat-msg:not(.chat-msg--mine)').getByTestId('chat-video')
    c.ok(await reaches(peer.last()), 'тренер: видит кружки клиента')
    c.ok((await peer.count()) === 2, 'тренер: оба кружка клиента в ленте')
    const bubble = peer.last()
    c.ok(await reaches(bubble.locator('video')), 'тренер: кружок загрузился — крутится без звука')
    await bubble.click()
    c.ok(await eventually(async () => (await bubble.getAttribute('class')).includes('is-sound')), 'тренер: тап — со звуком, кольцо прогресса')
    await screenshot(page, 'staff-chat-video-feed')

    const before = videos(chat, 'staff').length
    await tap(page, cdp, 'chat-mic')
    c.ok(await reaches(page.getByTestId('chat-video-button')), 'тренер: касание 🎤 пальцем — 📹')
    const f = await finger(page, cdp, 'chat-video-button')
    await f.down()
    c.ok(await reaches(page.getByTestId('chat-video-holding')), 'тренер: держит — снимает кружок')
    await wait(1800)
    await f.up()
    c.ok(await eventually(() => videos(chat, 'staff').length === before + 1, 100), 'тренер: отпустил — кружок ушёл клиенту')
    c.ok(await reaches(page.locator('.chat-msg--mine').getByTestId('chat-video').last()), 'тренер: свой кружок в ленте')
    c.ok(await eventually(async () => (await camOn(page)) === 0), 'тренер: камера выключена')
  } catch (e) {
    await screenshot(page, 'staff-chat-video-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('chat-video')
  const backend = createFakeBackend(completedTodaySeed())
  const chat = createFakeChat(backend.state)
  wireClient(backend, chat, INVITE)
  seedExpiredVideo(chat)
  const phone = await newE2eContext(browser, backend, IPHONE)
  try {
    await client(c, phone, chat)
    await trainer(c, browser, backend, chat)
  } finally {
    await phone.close()
  }
  return c.failures
}
