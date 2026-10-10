/**
 * Телефон тренера (/coach): вход паролем планшета → «ждёт разрешения» → админ разрешил → план дня
 * и «Новых диалогов: 1» → ответ клиенту → админ отозвал телефон → экран входа с объяснением.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'телефон тренера: вход, план дня, ответ клиенту'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const QUESTION = 'Завтра можно перенести на вечер?'
const REPLY = 'Да, давайте в 19:00'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function setup() {
  const backend = createFakeBackend(trainerClubSeed())
  const chat = createFakeChat(backend.state)
  chat.client(CLIENT_ID, { action: 'chat-send', kind: 'trainer', body: QUESTION })
  const schedule = [
    { id: 'e2e-slot-1', club_id: CLUB_ID, trainer_id: TRAINER_ID, day_date: isoDay(0), start_minutes: 600, duration_minutes: 60, title: '', client_ids: [CLIENT_ID] },
  ]
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule })
  backend.coach = coach.handle
  return { backend, chat, coach }
}

export async function run(browser) {
  const c = createChecks('coach-app')
  const { backend, chat, coach } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/coach`)
    await page.getByLabel('Логин').fill(TRAINER_LOGIN)
    await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    c.ok(await reaches(page.getByText('Телефон ждёт разрешения')), 'новый телефон ждёт «Разрешить» админа')
    const phone = coach.state.devices[0]
    c.ok(phone?.status === 'pending' && phone.device_id.startsWith('coach-'), 'на сервере телефон записан как ждущий, номер coach-…')
    await screenshot(page, 'coach-pending')

    coach.setPhoneStatus('approved')
    await page.getByRole('button', { name: 'Проверить сейчас' }).click()
    const today = page.getByRole('region', { name: 'Сегодня' })
    c.ok(await reaches(today.getByText('10:00')), 'после разрешения — план на сегодня со временем')
    c.ok(await reaches(today.getByText(CLIENT_NAME)), 'в слоте имя клиента')
    c.ok(await reaches(page.getByRole('region', { name: 'Завтра' }).getByText('Записей нет')), 'завтра пусто — так и написано')
    const attention = page.getByRole('link', { name: /Новых диалогов: 1/ })
    c.ok(await reaches(attention), 'сверху «Новых диалогов: 1»')
    await screenshot(page, 'coach-today')

    await attention.click()
    await page.getByRole('link', { name: new RegExp(CLIENT_NAME) }).click()
    await page.waitForURL(`${ORIGIN}/coach/chat/${CLIENT_ID}`)
    c.ok(await reaches(page.locator('.chat-msg', { hasText: QUESTION })), 'тренер видит вопрос клиента')
    await page.getByTestId('chat-input').fill(REPLY)
    await page.getByTestId('chat-send').click()
    c.ok(await reaches(page.locator('.chat-msg--mine', { hasText: REPLY })), 'ответ в ленте')
    const saved = chat.state.messages.at(-1)
    c.ok(saved?.author_side === 'staff' && saved?.author_user_id === TRAINER_ID && saved?.body === REPLY, 'на сервер ушёл ответ от имени тренера')
    await screenshot(page, 'coach-chat')

    coach.setPhoneStatus('revoked')
    await page.goto(`${ORIGIN}/coach/more`)
    c.ok(await reaches(page.getByRole('button', { name: 'Войти' })), 'отозванный телефон — снова экран входа')
    c.ok(await reaches(page.getByRole('status')), 'на экране входа объяснение, почему вышли')
    await screenshot(page, 'coach-revoked')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'coach-FAIL').catch(() => null)
    c.ok(false, `телефон тренера: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
