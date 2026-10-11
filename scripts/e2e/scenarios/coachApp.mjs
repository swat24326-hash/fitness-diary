/**
 * Телефон тренера (/coach): вход паролем планшета → «ждёт разрешения» → админ разрешил → Ежедневник
 * и метка «1» на «Сообщениях» → ответ клиенту → админ отозвал телефон → экран входа с объяснением.
 * Отдельно — вход по QR с планшета.
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

const slot10 = (page) => page.locator('.trainer-schedule-day__entry[aria-label^="10:00"]').first()

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
    c.ok(await reaches(slot10(page)), 'после разрешения — сразу Ежедневник с записью 10:00')
    c.ok(await reaches(slot10(page).getByText(CLIENT_NAME)), 'в записи имя клиента')
    c.ok((await page.getByRole('link', { name: 'Сегодня' }).count()) === 0, 'вкладки «Сегодня» больше нет')
    const attention = page.getByRole('link', { name: /новых диалогов: 1/ })
    c.ok(await reaches(attention), 'на вкладке «Сообщения» метка «1»')
    await screenshot(page, 'coach-today')
    c.ok((await page.getByRole('link', { name: 'Ещё' }).count()) === 0, 'вкладки «Ещё» внизу нет')
    await page.getByRole('link', { name: 'Меню', exact: true }).click()
    c.ok(await reaches(page.getByRole('button', { name: 'Выйти' })), 'три полоски в шапке открывают меню с выходом')
    c.ok(await page.getByRole('button', { name: 'Обновить' }).isVisible(), '«Обновить» — в меню')
    c.ok(await page.getByRole('switch', { name: 'Уведомления' }).isVisible(), 'меню как на планшете: переключатель «Уведомления»')
    const reminders = page.getByRole('switch', { name: 'Напоминания из Ежедневника' })
    c.ok(await reminders.isDisabled(), 'напоминания Ежедневника ждут включённых уведомлений')
    const soundSwitch = page.getByRole('switch', { name: 'Звуки сообщений' })
    c.ok((await soundSwitch.getAttribute('aria-checked')) === 'false', 'звуки сообщений на телефоне по умолчанию выключены')
    await soundSwitch.click()
    c.ok((await soundSwitch.getAttribute('aria-checked')) === 'true', 'звуки сообщений включаются переключателем в меню')
    await screenshot(page, 'coach-menu')

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
  await runQrJoin(browser, c)
  await runIconHandoff(browser, c)
  await runAndroidManifest(browser, c)
  return c.failures
}

/** Android: значок по manifest клуба — после входа и сразу при загрузке, ещё до приложения (manifest-boot.js). */
async function runAndroidManifest(browser, c) {
  const { backend, coach } = setup()
  const context = await newE2eContext(browser, backend, {
    ...PHONE,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  })
  const page = await context.newPage()
  const clubManifest = `/api/coach?manifest=${CLUB_ID}`
  const manifests = () =>
    page.evaluate(() => [...globalThis.document.querySelectorAll('link[rel="manifest"]')].map((l) => l.getAttribute('href')))
  try {
    await page.goto(`${ORIGIN}/coach`)
    await page.getByLabel('Логин').fill(TRAINER_LOGIN)
    await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    coach.setPhoneStatus('approved')
    await page.getByRole('button', { name: 'Проверить сейчас' }).click()
    await reaches(slot10(page))
    c.ok(JSON.stringify(await manifests()) === JSON.stringify([clubManifest]), 'Android: после входа manifest клуба — значок назовётся как клуб')
    await page.route('**/src/main.jsx*', (route) => route.abort())
    await page.reload()
    c.ok(JSON.stringify(await manifests()) === JSON.stringify([clubManifest]), 'Android: manifest клуба при загрузке, ещё до приложения')
  } catch (e) {
    await screenshot(page, 'coach-android-FAIL').catch(() => null)
    c.ok(false, `Android manifest: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/**
 * iPhone: Safari вошёл и разрешён → подсказка «на экран Домой» с названием клуба, адрес несёт вход →
 * значок (своё хранилище) открывает этот адрес и входит сам, без нового «Разрешить».
 */
async function runIconHandoff(browser, c) {
  const { backend, coach } = setup()
  const safari = await newE2eContext(browser, backend, PHONE)
  const icon = await newE2eContext(browser, backend, PHONE)
  await icon.addInitScript(() => Object.defineProperty(globalThis.navigator, 'standalone', { value: true }))
  const page = await safari.newPage()
  try {
    await page.goto(`${ORIGIN}/coach`)
    await page.getByLabel('Логин').fill(TRAINER_LOGIN)
    await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    coach.setPhoneStatus('approved')
    await page.getByRole('button', { name: 'Проверить сейчас' }).click()
    const banner = page.getByRole('region', { name: 'Значок на экран «Домой»' })
    await banner.getByRole('button', { name: 'Как?' }).click()
    c.ok(await reaches(banner.getByText('Откройте значок «E2E клуб»')), 'значок: подсказка в Safari (над Ежедневником) с названием клуба')
    const withToken = await page
      .waitForURL((u) => u.searchParams.has('h'), { timeout: 10_000 })
      .then(() => page.url())
      .catch(() => '')
    c.ok(Boolean(withToken), 'значок: адрес в Safari несёт вход для значка')
    c.ok((await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content')) === 'E2E клуб', 'значок: имя на iPhone — название клуба')
    await screenshot(page, 'coach-install-hint')

    const iconPage = await icon.newPage()
    await iconPage.goto(withToken || `${ORIGIN}/coach`)
    c.ok(await reaches(slot10(iconPage)), 'значок: открылся сразу с Ежедневником, без логина')
    c.ok(coach.state.devices.length === 1, 'значок: тот же разрешённый телефон, админу не нужно разрешать снова')
    c.ok(!new URL(iconPage.url()).searchParams.has('h'), 'значок: вход убран из адреса')
    c.ok(coach.state.invites.some((i) => i.kind === 'handoff' && i.used_at), 'значок: приглашение погашено')
    c.ok(!(await iconPage.getByRole('region', { name: 'Значок на экран «Домой»' }).isVisible()), 'значок: подсказки установки в значке нет')

    await banner.getByRole('button', { name: 'Готово' }).click()
    c.ok(!new URL(page.url()).searchParams.has('h'), 'значок: «Готово» в Safari убирает вход из адреса')
  } catch (e) {
    await screenshot(page, 'coach-handoff-FAIL').catch(() => null)
    c.ok(false, `значок iPhone: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await safari.close()
    await icon.close()
  }
}

/** QR с планшета: ссылка → «ждёт разрешения» (код убран из адреса, переживает перезагрузку) → разрешили → вошёл. */
async function runQrJoin(browser, c) {
  const { backend, coach } = setup()
  const token = 'e2eQrToken_0123456789abcdefABCD'
  coach.addInvite(token)
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/coach/join#t=${token}`)
    c.ok(await reaches(page.getByText('Телефон ждёт разрешения')), 'QR: телефон без пароля сразу ждёт «Разрешить»')
    c.ok(new URL(page.url()).hash === '', 'QR: код убран из адресной строки')
    await page.reload()
    c.ok(await reaches(page.getByText('Телефон ждёт разрешения')), 'QR: после перезагрузки ждёт дальше, код помнится')
    await screenshot(page, 'coach-qr-pending')

    coach.setPhoneStatus('approved')
    await page.getByRole('button', { name: 'Проверить сейчас' }).click()
    c.ok(await reaches(slot10(page)), 'QR: после разрешения — Ежедневник')
    c.ok(Boolean(coach.state.invites[0]?.used_at), 'QR: код погашен после входа')

    await page.evaluate(() => globalThis.localStorage.clear())
    await page.goto(`${ORIGIN}/coach/join#t=${token}`)
    c.ok(await reaches(page.getByText('Не получилось войти по QR')), 'QR: тот же код второй раз — понятный отказ')
    await page.getByRole('button', { name: 'Войти по логину и паролю' }).click()
    c.ok(await reaches(page.getByLabel('Логин')), 'QR: из отказа — на вход по паролю')
  } catch (e) {
    await screenshot(page, 'coach-qr-FAIL').catch(() => null)
    c.ok(false, `QR-вход: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}
