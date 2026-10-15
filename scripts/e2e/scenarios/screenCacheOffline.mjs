/**
 * Кэш экранов, как в Telegram: тренер на телефоне открыл переписку → в зале пропал интернет → плашка
 * «Нет сети — показываем сохранённое», диалог и список открываются из сохранённого (и в новой вкладке —
 * из IndexedDB, без крутилки и экрана ошибки) → написал без сети — сообщение с часиками, сеть вернулась — ушло
 * само ровно один раз → «Выйти» стирает сохранённое с телефона.
 * Клиент: открыл диалог с тренером → сервер недоступен → в новой вкладке переписка видна из сохранённого.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, newE2eContext, screenshot, setCloudOnline } from '../lib/e2eHarness.mjs'
import { CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, completedTodaySeed, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'
import { wireClient } from './clientChat.mjs'

export const name = 'кэш экранов: без сети переписка видна, плашка «Нет сети»'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const VERA = 'e2e-client-vera'
const VERA_TEXT = 'Спасибо за тренировку'
const CLIENT_TEXT = 'Буду в 18:00'
const OUTBOX_TEXT = 'Жду в зале в 19:00'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

/** Сколько записей в кэше экранов этой вкладки (null — базы ещё нет). */
function cacheCount(page, app) {
  return page.evaluate(
    (prefix) =>
      new Promise((resolve) => {
        const req = globalThis.indexedDB.open('fd-screen-cache')
        req.onerror = () => resolve(null)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('entries')) return resolve(null)
          const keys = db.transaction('entries').objectStore('entries').getAllKeys()
          keys.onsuccess = () => resolve(keys.result.filter((k) => String(k).startsWith(`${prefix}:`)).length)
        }
      }),
    app,
  )
}

async function eventually(check) {
  for (let i = 0; i < 50; i += 1) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

async function coachPhone(c, browser) {
  const backend = createFakeBackend(trainerClubSeed())
  backend.state.clients.push({ id: VERA, name: 'Вера Былапереписка', trainer_id: TRAINER_ID, club_id: CLUB_ID, phone: '', birth_date: null })
  const chat = createFakeChat(backend.state)
  chat.client(VERA, { action: 'chat-send', kind: 'trainer', body: VERA_TEXT })
  backend.coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule: [] }).handle
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/coach`)
    await page.getByLabel('Логин').fill(TRAINER_LOGIN)
    await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    await page.getByRole('link', { name: /^Сообщения/ }).click()
    const vera = page.locator('.chat-contacts__item', { hasText: 'Вера Былапереписка' }).getByRole('link')
    await vera.click()
    await page.waitForURL(`${ORIGIN}/coach/chat/${VERA}`)
    c.ok(await reaches(page.locator('.chat-msg', { hasText: VERA_TEXT })), 'тренер открыл переписку с Верой')
    c.ok(await eventually(async () => (await cacheCount(page, 'coach')) >= 2), 'список и диалог сохранены на телефоне')
    await page.locator('.coach-app__top .chat-bar').getByRole('link', { name: 'К списку' }).click()

    await setCloudOnline(context, backend, false)
    const bar = page.getByRole('status').filter({ hasText: 'Нет сети — показываем сохранённое' })
    c.ok(await reaches(bar), 'пропал интернет — плашка «Нет сети — показываем сохранённое»')
    await screenshot(page, 'screen-cache-coach-offline-list')
    await vera.click()
    c.ok(await reaches(page.locator('.chat-msg', { hasText: VERA_TEXT })), 'без сети диалог открылся из сохранённого')
    c.ok((await page.getByText('Загружаем…').count()) === 0, 'без крутилки «Загружаем…»')
    c.ok(await bar.isVisible(), 'перешёл на другой экран — плашка «Нет сети» сразу, без новой задержки')
    await screenshot(page, 'screen-cache-coach-offline-thread')

    await page.getByTestId('chat-input').fill(OUTBOX_TEXT)
    await page.getByTestId('chat-send').click()
    const parked = page.locator('.chat-msg--pending', { hasText: OUTBOX_TEXT })
    c.ok(await reaches(parked), 'без сети сообщение встало в ленту с часиками')
    c.ok((await page.getByTestId('chat-input').inputValue()) === '', 'поле очистилось — можно писать дальше')
    await screenshot(page, 'chat-outbox-pending')

    const cold = await context.newPage()
    await cold.goto(`${ORIGIN}/coach/chat/${VERA}`)
    c.ok(await reaches(cold.locator('.chat-msg', { hasText: VERA_TEXT })), 'новая вкладка без сервера: переписка из IndexedDB')
    c.ok((await cold.getByRole('button', { name: 'Повторить' }).count()) === 0, 'новая вкладка: вместо экрана ошибки — сохранённое')
    c.ok(await reaches(cold.locator('.chat-msg--pending', { hasText: OUTBOX_TEXT })), 'новая вкладка: часики на месте (ждущее сохранено)')
    await cold.close()

    await setCloudOnline(context, backend, true)
    c.ok(await reaches(bar, 'hidden'), 'интернет вернулся — плашка пропала')
    c.ok(await reaches(parked, 'hidden'), 'сеть вернулась — часики пропали, сообщение ушло само')
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: OUTBOX_TEXT })), 'отправленное осталось в ленте')
    c.ok(chat.state.messages.filter((m) => m.body === OUTBOX_TEXT).length === 1, 'ушло ровно один раз, без дубля')
    await page.goto(`${ORIGIN}/coach/more`)
    await page.getByRole('button', { name: 'Выйти' }).click()
    c.ok(await eventually(async () => (await cacheCount(page, 'coach')) === 0), '«Выйти» стирает сохранённое с телефона')
    c.ok(pageErrors.length === 0, `телефон: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'screen-cache-coach-FAIL').catch(() => null)
    c.ok(false, `телефон тренера: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function clientPhone(c, browser) {
  const backend = createFakeBackend(completedTodaySeed())
  const chat = createFakeChat(backend.state)
  wireClient(backend, chat, 'e2e-cache-invite')
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/join#t=e2e-cache-invite`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
    await page.goto(`${ORIGIN}/me/chat/trainer`)
    await page.getByTestId('chat-input').fill(CLIENT_TEXT)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: CLIENT_TEXT })), 'клиент написал тренеру')
    c.ok(await eventually(async () => (await cacheCount(page, 'client')) >= 1), 'диалог клиента сохранён на телефоне')

    backend.cloudDown = true
    const cold = await context.newPage()
    await cold.goto(`${ORIGIN}/me/chat/trainer`)
    c.ok(await reaches(cold.locator('.chat-msg--mine', { hasText: CLIENT_TEXT })), 'клиент: сервер недоступен — переписка из сохранённого')
    c.ok((await cold.getByText('Не открылось').count()) === 0, 'клиент: без экрана «Не открылось»')
    await screenshot(cold, 'screen-cache-client-offline')
    await cold.close()
    backend.cloudDown = false
  } catch (e) {
    await screenshot(page, 'screen-cache-client-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('screen-cache')
  await coachPhone(c, browser)
  await clientPhone(c, browser)
  return c.failures
}
