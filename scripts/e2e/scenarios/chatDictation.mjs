/**
 * Голосовой ввод в переписке (как в Cursor): 🎤 → волна и таймер → ✓ → «Распознаю…» → текст в поле на место курсора,
 * не отправляется сам; × и Esc — отмена без распознавания; запрет микрофона — понятная ошибка.
 * Клиент на iPhone и тренер на планшете. Микрофон — подставной тон, SpeechKit — подменный сервер.
 */
import { CHAT_DICTATION_DENIED_RU } from '../../../src/lib/chat/chatDictationCore.js'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_NAME, TRAINER_LOGIN, TRAINER_PASSWORD, completedTodaySeed } from '../lib/fixtures.mjs'
import { wireClient } from './clientChat.mjs'

export const name = 'переписка: голосовой ввод'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const INVITE = 'e2e-dictation-invite'
const SPOKEN = 'Купите резинку средней жёсткости.'

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

const micOn = (page) => page.evaluate(() => globalThis.__micOn)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

/** Ответ распознавания с задержкой — чтобы увидеть «Распознаю…». */
async function slowDictate(page, path, isDictate) {
  await page.route(`**${path}*`, async (route) => {
    if (isDictate(route.request().postData() ?? '')) await wait(900)
    await route.fallback()
  })
}

/** Общая часть для клиента и тренера: запись → текст на место курсора, отмена ×/Esc, без автоотправки. */
async function dictateFlow(c, page, chat, who) {
  const input = page.getByTestId('chat-input')
  await input.fill('Привет!')
  const sentBefore = chat.state.messages.length + chat.state.dm.messages.length
  await page.getByTestId('chat-mic').click()
  const bar = page.getByTestId('chat-dictation')
  c.ok(await reaches(bar), `${who}: 🎤 — вместо поля волна и таймер`)
  c.ok(!(await input.isVisible()), `${who}: поле на время записи спрятано`)
  await wait(1500)
  c.ok((await micOn(page)) === 1, `${who}: микрофон включён`)
  c.ok((await bar.innerText()).includes('0:01'), `${who}: таймер идёт`)
  const tall = await page.locator('.chat-dictation__wave > i').evaluateAll((els) => els.filter((e) => !e.style.transform.includes('scaleY(0.12)')).length)
  c.ok(tall > 0, `${who}: волна двигается от голоса`)
  await screenshot(page, `${who === 'клиент' ? 'client' : 'staff'}-chat-dictation`)
  await page.getByTestId('chat-dictation-done').click()
  c.ok(await reaches(page.getByTestId('chat-dictation-busy')), `${who}: ✓ — «Распознаю…»`)
  await screenshot(page, `${who === 'клиент' ? 'client' : 'staff'}-chat-dictation-busy`)
  c.ok(await reaches(input), `${who}: поле вернулось`)
  await page.waitForFunction((v) => globalThis.document.querySelector('[data-testid="chat-input"]')?.value === v, `Привет! ${SPOKEN}`, { timeout: 10_000 }).catch(() => null)
  c.ok((await input.inputValue()) === `Привет! ${SPOKEN}`, `${who}: текст дописан после «Привет!» с пробелом`)
  c.ok((await micOn(page)) === 0, `${who}: после ✓ микрофон выключен`)
  c.ok(chat.state.dictated.length >= 1 && chat.state.dictated.at(-1) >= 32000, `${who}: на сервер ушло ≥1 с звука (16 кГц PCM)`)
  c.ok(chat.state.messages.length + chat.state.dm.messages.length === sentBefore, `${who}: сам не отправил — можно поправить`)
  await screenshot(page, `${who === 'клиент' ? 'client' : 'staff'}-chat-dictation-text`)

  const asked = chat.state.dictated.length
  await page.getByTestId('chat-mic').click()
  c.ok(await reaches(bar), `${who}: снова запись`)
  await wait(600)
  await page.getByRole('button', { name: 'Отменить запись' }).click()
  c.ok(await reaches(input), `${who}: × — назад к полю`)
  await page.keyboard.press('End')
  await page.getByTestId('chat-mic').click()
  c.ok(await reaches(bar), `${who}: и ещё раз запись`)
  await wait(600)
  await page.keyboard.press('Escape')
  c.ok(await reaches(input), `${who}: Esc — назад к полю`)
  c.ok((await input.inputValue()) === `Привет! ${SPOKEN}`, `${who}: отмена не трогает текст`)
  c.ok(chat.state.dictated.length === asked, `${who}: отменённое не распознаётся (не платим)`)
  c.ok((await micOn(page)) === 0, `${who}: после отмены микрофон выключен`)
}

async function client(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  await fakeMic(page)
  await slowDictate(page, '/api/client-me', (body) => body.includes('"chat-dictate"'))
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/chat/trainer`)
    c.ok(await reaches(page.getByRole('button', { name: 'Голосовой ввод' })), 'клиент: в поле сообщения кнопка 🎤')
    await dictateFlow(c, page, chat, 'клиент')
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: SPOKEN })), 'клиент: отправил сам — сообщение в ленте')
    await page.evaluate(() => (globalThis.__micDenied = true))
    await page.getByTestId('chat-mic').click()
    c.ok(await reaches(page.getByTestId('chat-dictation-error').getByText(CHAT_DICTATION_DENIED_RU)), 'клиент: микрофон запрещён — понятная подсказка')
    await screenshot(page, 'client-chat-dictation-denied')
    await page.getByTestId('chat-input').fill('ок')
    c.ok(await reaches(page.getByTestId('chat-dictation-error'), 'hidden'), 'клиент: начал печатать — подсказка ушла')
  } catch (e) {
    await screenshot(page, 'client-chat-dictation-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function trainer(c, browser, backend, chat) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  await fakeMic(page)
  await slowDictate(page, '/api/admin-data', (body) => body.includes('"dictate"'))
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.getByRole('link', { name: /^Сообщения клуба/ }).click()
    await page.getByRole('link', { name: 'Диалоги', exact: true }).click()
    await page.getByTestId('chat-contacts').getByRole('link', { name: new RegExp(CLIENT_NAME) }).click()
    c.ok(await reaches(page.locator('.chat-msg', { hasText: SPOKEN })), 'тренер: видит надиктованное клиентом')
    await dictateFlow(c, page, chat, 'тренер')
  } catch (e) {
    await screenshot(page, 'staff-chat-dictation-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('chat-dictation')
  const backend = createFakeBackend(completedTodaySeed())
  const chat = createFakeChat(backend.state)
  wireClient(backend, chat, INVITE)
  await client(c, browser, backend, chat)
  await trainer(c, browser, backend, chat)
  return c.failures
}
