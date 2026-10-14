/**
 * Голосовые в переписке, как в Telegram. Клиент на iPhone (палец): короткое касание — «Удерживайте»; держит — пишется,
 * отпустил — ушло; влево — отмена; вверх — без рук → «Отправить»; запрет микрофона — понятная ошибка.
 * Тренер на планшете (мышь): синие точки непрослушанных; ▶ — доиграло, само включилось следующее; мини-плеер над лентой,
 * снизу на другом экране, ✕; перемотка нажатием и перетаскиванием, скорость, «→ Аа» — текст; клик — без рук → ■ пауза →
 * 🎤 дописать → ■ → обрезка ручкой → «Отправить без звука»; удержание мышью — отправка, влево / Esc — отмена;
 * ушёл посреди записи — черновик; «1» — одноразовое. Клиент слушает одноразовое раз — дальше «прослушано», сервер 410.
 * Голосовое старше суток — «удалено».
 * Микрофон — подставной тон, бакет и SpeechKit — подменные (fakeChat.mjs), ответы — настоящий chatVoiceHandler.
 */
import * as lame from '@breezystack/lamejs'
import { CHAT_VOICE_DENIED_RU, CHAT_VOICE_EXPIRED_RU, CHAT_VOICE_HOLD_RU, CHAT_VOICE_ONCE_ON_RU } from '../../../src/lib/chat/chatVoiceCore.js'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, TRAINER_LOGIN, TRAINER_PASSWORD, completedTodaySeed } from '../lib/fixtures.mjs'
import { wireClient } from './clientChat.mjs'

export const name = 'переписка: голосовые'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const INVITE = 'e2e-voice-invite'

/** Микрофон = тон 440 Гц; __micOn — сколько микрофонов сейчас включено, __micDenied — «Запретить». */
async function fakeMic(page) {
  await page.addInitScript(() => {
    globalThis.__micOn = 0
    navigator.mediaDevices.getUserMedia = async () => {
      if (globalThis.__micDenied) throw new DOMException('Permission denied', 'NotAllowedError')
      const ctx = new globalThis.AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0.3
      const dest = ctx.createMediaStreamDestination()
      osc.connect(gain).connect(dest)
      osc.start()
      globalThis.__micOn += 1
      const track = dest.stream.getAudioTracks()[0]
      const stop = track.stop.bind(track)
      track.stop = () => {
        globalThis.__micOn -= 1
        stop()
        void ctx.close()
      }
      return dest.stream
    }
  })
}

/** Голосовое, отправленное позавчера: звук уже удалён правилом бакета. */
function seedExpiredVoice(chat) {
  const enc = new lame.Mp3Encoder(1, 16000, 32)
  const pcm = Int16Array.from({ length: 32000 }, (_, i) => Math.round(Math.sin((2 * Math.PI * 440 * i) / 16000) * 8000))
  const audio = Buffer.concat([enc.encodeBuffer(pcm), enc.flush()].map((p) => Buffer.from(p.buffer, p.byteOffset, p.length))).toString('base64')
  chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', audio, sec: 2, wave: Array.from({ length: 48 }, () => 40) })
  chat.state.messages.at(-1).created_at = new Date(Date.now() - 50 * 3600_000).toISOString()
}

const micOn = (page) => page.evaluate(() => globalThis.__micOn)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const voiceCount = (chat) => chat.state.messages.filter((m) => m.voice_sec).length

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

/** Палец на 🎤 — настоящие касания (CDP), как на iPhone: pointerType touch. */
async function finger(page, cdp) {
  const box = await page.getByTestId('chat-mic').boundingBox()
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

async function client(c, context, chat) {
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await fakeMic(page)
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/chat/trainer`)
    c.ok(await reaches(page.getByTestId('chat-mic')), 'клиент: поле пустое — справа 🎤 вместо «Отправить»')
    c.ok(await reaches(page.getByText(new RegExp(CHAT_VOICE_EXPIRED_RU))), 'клиент: голосовое старше суток — «удалено», длительность осталась')
    await page.getByTestId('chat-input').fill('Привет')
    c.ok(await reaches(page.getByTestId('chat-send')), 'клиент: начал печатать — 🎤 сменилась на «Отправить»')
    await page.getByTestId('chat-input').fill('')

    let f = await finger(page, cdp)
    /* Не ждём подтверждения касания: подставной микрофон занимает страницу ~200 мс — это задержка стенда, не пальца. */
    const tapDown = f.down()
    await wait(80)
    await Promise.all([tapDown, f.up()])
    c.ok(await reaches(page.getByTestId('chat-voice-hint').getByText(CHAT_VOICE_HOLD_RU)), 'клиент: короткое касание — подсказка «Удерживайте»')
    c.ok(await eventually(async () => (await micOn(page)) === 0), 'клиент: после касания микрофон выключен')

    const before = voiceCount(chat)
    f = await finger(page, cdp)
    await f.down()
    c.ok(await reaches(page.getByTestId('chat-voice-holding')), 'клиент: держит — идёт запись, «‹ Влево — отмена»')
    c.ok(!(await page.getByTestId('chat-input').isVisible()), 'клиент: поле на время записи спрятано')
    await wait(1700)
    c.ok((await page.getByTestId('chat-voice-time').innerText()) >= '0:01', 'клиент: таймер идёт')
    await screenshot(page, 'client-chat-voice-holding')
    await f.up()
    c.ok(await eventually(() => voiceCount(chat) === before + 1), 'клиент: отпустил — голосовое ушло')
    const sent = chat.state.messages.at(-1)
    c.ok(sent.voice_sec >= 1 && sent.body.startsWith('🎤 Голосовое') && chat.state.voices.size >= 2, 'клиент: на сервере MP3, длительность и подпись для списка')
    c.ok(await reaches(page.locator('.chat-msg--mine.chat-msg--voice').last()), 'клиент: голосовое в ленте пузырём с волной')
    c.ok(await reaches(page.locator('.chat-msg--mine').getByTestId('chat-voice-unplayed').last()), 'клиент: у своего голосового синяя точка — тренер ещё не слушал')
    c.ok(await eventually(async () => (await micOn(page)) === 0), 'клиент: после отправки микрофон выключен')
    await screenshot(page, 'client-chat-voice-sent')

    f = await finger(page, cdp)
    await f.down()
    c.ok(await reaches(page.getByTestId('chat-voice-holding')), 'клиент: снова держит')
    await wait(700)
    await f.slide(-130, 0)
    c.ok(await reaches(page.getByTestId('chat-voice-holding'), 'hidden'), 'клиент: увёл палец влево — запись отменена')
    await f.up()
    await wait(400)
    c.ok(voiceCount(chat) === before + 1, 'клиент: отменённое не отправилось')
    c.ok(await eventually(async () => (await micOn(page)) === 0), 'клиент: после отмены микрофон выключен')

    f = await finger(page, cdp)
    await f.down()
    await wait(500)
    await f.slide(0, -100)
    c.ok(await reaches(page.getByTestId('chat-voice-locked')), 'клиент: палец вверх — запись без рук')
    await f.up()
    await wait(1300)
    c.ok(await page.getByTestId('chat-voice-locked').isVisible(), 'клиент: отпустил палец — запись идёт дальше')
    await screenshot(page, 'client-chat-voice-locked')
    await page.getByTestId('chat-voice-send').click()
    c.ok(await eventually(() => voiceCount(chat) === before + 2), 'клиент: «Отправить» — ушло голосовое без рук')

    await page.evaluate(() => (globalThis.__micDenied = true))
    f = await finger(page, cdp)
    await f.down()
    await wait(600)
    await f.up()
    c.ok(await reaches(page.getByTestId('chat-voice-error').getByText(CHAT_VOICE_DENIED_RU)), 'клиент: микрофон запрещён — понятная подсказка')
    await screenshot(page, 'client-chat-voice-denied')
  } catch (e) {
    await screenshot(page, 'client-chat-voice-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

async function trainer(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  await fakeMic(page)
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.getByRole('link', { name: /^Сообщения клуба/ }).click()
    await page.getByTestId('chat-contacts').getByRole('link', { name: new RegExp(CLIENT_NAME) }).click()
    const peerVoice = page.locator('.chat-msg:not(.chat-msg--mine) .chat-voice:not(.chat-voice--expired)')
    c.ok(await reaches(peerVoice.last()), 'тренер: видит голосовое клиента')
    c.ok((await peerVoice.getByTestId('chat-voice-unplayed').count()) === 2, 'тренер: у непрослушанных голосовых синяя точка')

    const bubble = peerVoice.last()
    const mini = page.getByTestId('chat-voice-mini')
    await peerVoice.first().getByRole('button', { name: 'Слушать' }).click()
    c.ok(await reaches(mini), 'тренер: играет — над лентой мини-плеер')
    c.ok(await reaches(bubble.getByRole('button', { name: 'Пауза' })), 'тренер: доиграло — само включилось следующее голосовое клиента')
    await bubble.getByRole('button', { name: 'Пауза' }).click()
    c.ok(await eventually(async () => (await peerVoice.getByTestId('chat-voice-unplayed').count()) === 0), 'тренер: прослушанные — точки погасли')
    const fresh = chat.state.messages.filter((m) => m.author_side === 'client' && m.voice_key && Date.now() - Date.parse(m.created_at) < 3600_000)
    c.ok(fresh.length === 2 && fresh.every((m) => m.voice_played_at), 'тренер: на сервере отмечено «прослушано» — клиент увидит')
    await page.goBack()
    c.ok(await reaches(page.locator('.chat-voice-mini--floating')), 'тренер: ушёл из диалога — мини-плеер остался (снизу, шапку не закрывает)')
    await screenshot(page, 'staff-chat-voice-mini-floating')
    await page.goForward()
    c.ok(await reaches(page.locator('.chat-voice-mini:not(.chat-voice-mini--floating)')), 'тренер: вернулся — мини-плеер снова над лентой')
    await page.getByTestId('chat-voice-mini-close').click()
    c.ok(await reaches(mini, 'hidden'), 'тренер: ✕ — мини-плеер закрыт')

    await bubble.getByRole('button', { name: 'Слушать' }).click()
    c.ok(await reaches(bubble.getByRole('button', { name: 'Пауза' })), 'тренер: ▶ — играет')
    await bubble.getByRole('button', { name: 'Скорость' }).click()
    c.ok((await bubble.getByRole('button', { name: 'Скорость' }).innerText()).trim() === '1.5x', 'тренер: скорость 1x → 1.5x')
    const wave = bubble.getByRole('button', { name: 'Перемотать' })
    const box = await wave.boundingBox()
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2)
    c.ok(await eventually(async () => (await bubble.locator('.chat-voice__wave span.is-played').count()) >= 12), 'тренер: нажал на волну — перемотал')
    await screenshot(page, 'staff-chat-voice-playing')
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 })
    c.ok((await bubble.locator('.chat-voice__wave span.is-played').count()) >= 36, 'тренер: тянет по волне — перематывает на ходу')
    await page.mouse.up()

    await bubble.getByRole('button', { name: 'Показать текстом' }).click()
    c.ok(await reaches(bubble.getByText(chat.state.voiceText)), 'тренер: «→ Аа» — текст под голосовым')
    c.ok(chat.state.voiceTextStarts === 1, 'тренер: распознали один раз')
    c.ok(chat.state.messages.some((m) => m.voice_text === chat.state.voiceText), 'тренер: текст сохранён — у клиента будет без новой оплаты')
    await screenshot(page, 'staff-chat-voice-text')

    const before = voiceCount(chat)
    const mic = page.getByTestId('chat-mic')
    await mic.click()
    c.ok(await reaches(page.getByTestId('chat-voice-locked')), 'тренер: клик мышью по 🎤 — запись без рук')
    await wait(1300)
    await page.getByTestId('chat-voice-stop').click()
    c.ok(await reaches(page.getByTestId('chat-voice-review')), 'тренер: ■ — пауза, можно прослушать')
    c.ok(voiceCount(chat) === before, 'тренер: на паузе само не ушло')
    c.ok(await eventually(async () => (await micOn(page)) === 0), 'тренер: на паузе микрофон выключен')
    await page.getByTestId('chat-voice-resume').click()
    c.ok(await reaches(page.getByTestId('chat-voice-locked')), 'тренер: 🎤 на паузе — дописывает ту же запись')
    c.ok(await eventually(async () => (await micOn(page)) === 1), 'тренер: дописывает — микрофон снова включён')
    await wait(1300)
    await page.getByTestId('chat-voice-stop').click()
    c.ok(await reaches(page.getByTestId('chat-voice-review')), 'тренер: снова пауза')
    const timeOf = async () => {
      const [m, s] = (await page.getByTestId('chat-voice-time').innerText()).split(':').map(Number)
      return m * 60 + s
    }
    const whole = await timeOf()
    c.ok(whole >= 2, 'тренер: запись — обе части вместе')
    const trimBox = await page.locator('.chat-voice-trim').boundingBox()
    const handle = await page.getByTestId('chat-voice-trim-start').boundingBox()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(trimBox.x + trimBox.width * 0.5, handle.y + handle.height / 2, { steps: 5 })
    await page.mouse.up()
    const kept = await timeOf()
    c.ok(kept < whole, 'тренер: потянул левую ручку — начало обрезано, время меньше')
    await screenshot(page, 'staff-chat-voice-review')
    await page.getByTestId('chat-voice-send').click({ button: 'right' })
    c.ok(await reaches(page.getByTestId('chat-voice-send-silent')), 'тренер: правая кнопка на «Отправить» — «Отправить без звука»')
    await screenshot(page, 'staff-chat-voice-silent')
    await page.getByTestId('chat-voice-send-silent').click()
    c.ok(await eventually(() => voiceCount(chat) === before + 1), 'тренер: отправил с паузы')
    const silentOne = chat.state.messages.at(-1)
    c.ok(chat.state.silentSends.includes(silentOne.id), 'тренер: ушло «без звука» — push клиенту будет тихим')
    c.ok(silentOne.voice_sec === kept, 'тренер: на сервер ушёл только оставленный кусок')

    const mb = await mic.boundingBox()
    const cx = mb.x + mb.width / 2
    const cy = mb.y + mb.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await wait(1500)
    await page.mouse.up()
    c.ok(await eventually(() => voiceCount(chat) === before + 2), 'тренер: удержал мышью и отпустил — ушло')

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    c.ok(await reaches(page.getByTestId('chat-voice-holding')), 'тренер: держит мышью')
    await wait(600)
    await page.mouse.move(cx - 150, cy, { steps: 5 })
    await page.mouse.up()
    c.ok(await reaches(page.getByTestId('chat-voice-holding'), 'hidden'), 'тренер: увёл влево — отмена')

    await mic.click()
    c.ok(await reaches(page.getByTestId('chat-voice-locked')), 'тренер: снова без рук')
    await wait(500)
    await page.keyboard.press('Escape')
    c.ok(await reaches(page.getByTestId('chat-mic')), 'тренер: Esc — отмена')
    await wait(400)
    c.ok(voiceCount(chat) === before + 2, 'тренер: отменённые не отправились')
    c.ok(await eventually(async () => (await micOn(page)) === 0), 'тренер: после отмены микрофон выключен')

    await mic.click()
    c.ok(await reaches(page.getByTestId('chat-voice-locked')), 'тренер: пишет и уходит из диалога')
    await wait(1300)
    await page.goBack()
    c.ok(await eventually(async () => (await micOn(page)) === 0), 'тренер: ушёл — микрофон выключен')
    await page.goForward()
    c.ok(await reaches(page.getByTestId('chat-voice-review')), 'тренер: вернулся — запись ждёт черновиком')
    c.ok(voiceCount(chat) === before + 2, 'тренер: черновик сам не ушёл')
    await page.getByTestId('chat-voice-delete').click()
    c.ok(await reaches(page.getByTestId('chat-mic')), 'тренер: 🗑 — черновик удалён')

    await mic.click()
    c.ok(await reaches(page.getByTestId('chat-voice-locked')), 'тренер: одноразовое — пишет без рук')
    await page.getByTestId('chat-voice-once').click()
    c.ok((await page.getByTestId('chat-voice-once').getAttribute('aria-pressed')) === 'true', 'тренер: «1» включено')
    c.ok(await reaches(page.getByTestId('chat-voice-hint').getByText(CHAT_VOICE_ONCE_ON_RU)), 'тренер: подсказка «прослушает один раз»')
    await screenshot(page, 'staff-chat-voice-once-toggle')
    await wait(1300)
    await page.getByTestId('chat-voice-send').click()
    c.ok(await eventually(() => voiceCount(chat) === before + 3), 'тренер: одноразовое ушло')
    const onceOne = chat.state.messages.at(-1)
    c.ok(onceOne.voice_once === true && onceOne.body.startsWith('🎤 Одноразовое голосовое'), 'тренер: на сервере одноразовое, в списке и push — «Одноразовое голосовое»')
    c.ok(await reaches(page.locator('.chat-msg--mine').getByTestId('chat-voice-once-mine').last()), 'тренер: своё одноразовое — без ▶, ждёт собеседника')
    c.ok(await eventually(async () => (await micOn(page)) === 0), 'тренер: после отправки микрофон выключен')
  } catch (e) {
    await screenshot(page, 'staff-chat-voice-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/** Клиент слушает одноразовое тренера: один раз, без перемотки и текста; дальше — «прослушано», сервер звук не отдаёт. */
async function clientOnce(c, context, chat) {
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/chat/trainer`)
    const play = page.getByTestId('chat-voice-once-play')
    c.ok(await reaches(play), 'клиент: одноразовое — ▶ с «1»')
    const bubble = page.locator('.chat-voice--once')
    c.ok(await bubble.getByRole('button', { name: 'Показать текстом' }).count() === 0, 'клиент: у одноразового нет «→ Аа»')
    c.ok(await bubble.getByRole('button', { name: 'Перемотать' }).isDisabled(), 'клиент: перемотки нет')
    await screenshot(page, 'client-chat-voice-once')
    await play.click()
    c.ok(await reaches(page.getByTestId('chat-voice-once-gone')), 'клиент: дослушал — «Одноразовое голосовое прослушано»')
    const onceOne = chat.state.messages.find((m) => m.voice_once)
    c.ok(Boolean(onceOne.voice_played_at) && onceOne.voice_key === null, 'клиент: на сервере прослушано, ключ звука стёрт')
    const again = await chat.client(CLIENT_ID, { action: 'chat-voice-audio', kind: 'trainer', message_id: onceOne.id })
    c.ok(again.status === 410, 'клиент: второй раз сервер звук не отдаёт')
    await page.reload()
    c.ok(await reaches(page.getByTestId('chat-voice-once-gone')), 'клиент: после перезагрузки — тоже «прослушано»')
    await screenshot(page, 'client-chat-voice-once-gone')
  } catch (e) {
    await screenshot(page, 'client-chat-voice-once-FAIL').catch(() => null)
    c.ok(false, `клиент (одноразовое): сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

export async function run(browser) {
  const c = createChecks('chat-voice')
  const backend = createFakeBackend(completedTodaySeed())
  const chat = createFakeChat(backend.state)
  wireClient(backend, chat, INVITE)
  seedExpiredVoice(chat)
  const phone = await newE2eContext(browser, backend, IPHONE)
  try {
    await client(c, phone, chat)
    await trainer(c, browser, backend, chat)
    await clientOnce(c, phone, chat)
  } finally {
    await phone.close()
  }
  return c.failures
}
