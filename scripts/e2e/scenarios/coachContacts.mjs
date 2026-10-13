/**
 * Папки «Сообщений»: в «Клиентах» все свои активные. С приложением — ярко и сверху (ждущий ответа первым),
 * без — тускло с подписью «Нет приложения». Нажатие на тусклого — ссылка-приглашение (QR) с телефона.
 * Поиск по имени. На планшете у тренера та же папка.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'папки сообщений: с приложением ярко, без — пригласить'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const GALINA = 'e2e-client-galina'
const BORIS = 'e2e-client-boris'
const VERA = 'e2e-client-vera'

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function setup() {
  const backend = createFakeBackend(trainerClubSeed())
  const own = (id, name, extra = {}) => ({ id, name, trainer_id: TRAINER_ID, club_id: CLUB_ID, phone: '', birth_date: null, ...extra })
  backend.state.clients.push(
    own(GALINA, 'Галина Ждёт'),
    own(BORIS, 'Борис Безприложения'),
    own(VERA, 'Вера Былапереписка'),
    own('e2e-client-archived', 'Архивный Клиент', { archived_at: new Date().toISOString() }),
    { ...own('e2e-client-alien', 'Чужой Клиент'), trainer_id: 'e2e-other-trainer' },
  )
  backend.state.client_sessions = [
    { client_id: CLIENT_ID, revoked_at: null },
    { client_id: GALINA, revoked_at: null },
    { client_id: VERA, revoked_at: new Date().toISOString() },
  ]
  const chat = createFakeChat(backend.state)
  chat.client(VERA, { action: 'chat-send', kind: 'trainer', body: 'Спасибо за тренировку' })
  chat.staff({ method: 'GET', searchParams: new URLSearchParams({ action: 'chat', view: 'thread', kind: 'trainer', client_id: VERA }) }, backend.state.users.find((u) => u.id === TRAINER_ID))
  chat.client(GALINA, { action: 'chat-send', kind: 'trainer', body: 'Можно перенести на завтра?' })
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule: [] })
  backend.coach = coach.handle
  return { backend, coach, chat }
}

const names = (list) => list.locator('.chat-row__title').allInnerTexts()

async function checkList(c, page, label) {
  const list = page.getByTestId('chat-contacts')
  c.ok(await reaches(list.getByText('Борис Безприложения')), `${label}: в «Клиентах» все свои, и без переписки`)
  const order = await names(list)
  c.ok(
    JSON.stringify(order) === JSON.stringify(['Галина Ждёт', CLIENT_NAME, 'Борис Безприложения', 'Вера Былапереписка']),
    `${label}: ждущий ответа первым, яркие выше тусклых, тусклые по алфавиту (${order.join(', ')})`,
  )
  c.ok(!order.includes('Архивный Клиент') && !order.includes('Чужой Клиент'), `${label}: без архива и чужих`)
  const dim = list.locator('.chat-row--dim')
  c.ok((await dim.count()) === 2, `${label}: тусклых двое — у кого нет приложения`)
  c.ok(await reaches(dim.first().getByText('Нет приложения')), `${label}: у тусклого подпись «Нет приложения»`)
  c.ok(await reaches(page.getByTestId('chat-folders').getByRole('button', { name: /Клиенты/ })), `${label}: вкладка папки «Клиенты»`)
}

async function phone(c, browser) {
  const { backend, coach } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/coach`)
    await page.getByLabel('Логин').fill(TRAINER_LOGIN)
    await page.getByLabel('Пароль').fill(TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти' }).click()
    coach.setPhoneStatus('approved')
    await page.getByRole('button', { name: 'Проверить сейчас' }).click()
    await page.getByRole('link', { name: /^Сообщения/ }).click()
    await checkList(c, page, 'телефон')
    await screenshot(page, 'coach-contacts')

    await page.getByRole('searchbox', { name: 'Найти по имени' }).fill('галин')
    c.ok(JSON.stringify(await names(page.getByTestId('chat-contacts'))) === '["Галина Ждёт"]', 'поиск: «галин» — только Галина')
    await page.getByRole('searchbox', { name: 'Найти по имени' }).fill('')

    await page.getByRole('button', { name: /Борис Безприложения/ }).click()
    const modal = page.getByRole('dialog', { name: 'Приложение клиента' })
    c.ok(await reaches(modal.getByRole('img', { name: 'QR-код для входа клиента' })), 'тусклый клиент: QR для входа в приложение')
    c.ok(coach.state.clientInvites.at(-1)?.client_id === BORIS, 'ссылку выдал сервер телефона для этого клиента')
    c.ok((await modal.getByRole('button', { name: 'Отключить все входы' }).count()) === 0, 'с телефона входы не отключают')
    await screenshot(page, 'coach-contacts-invite')
    await modal.getByRole('button', { name: 'Закрыть' }).click()

    const veraRow = page.locator('.chat-contacts__item', { hasText: 'Вера Былапереписка' })
    c.ok(await reaches(veraRow.getByRole('button', { name: 'Пригласить' })), 'тусклый с перепиской: рядом «Пригласить»')
    await veraRow.getByRole('link').click()
    await page.waitForURL(`${ORIGIN}/coach/chat/${VERA}`)
    c.ok(await reaches(page.locator('.chat-msg', { hasText: 'Спасибо за тренировку' })), 'тусклый с перепиской: открывается история')
    c.ok(pageErrors.length === 0, `телефон: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'coach-contacts-FAIL').catch(() => null)
    c.ok(false, `папки на телефоне: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function tablet(c, browser) {
  const { backend, chat } = setup()
  backend.adminData = (req, user) => chat.staff(req, user)
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.goto(`${ORIGIN}/messages`)
    await checkList(c, page, 'планшет')
    await screenshot(page, 'staff-contacts')
  } catch (e) {
    await screenshot(page, 'staff-contacts-FAIL').catch(() => null)
    c.ok(false, `папки на планшете: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('coach-contacts')
  await phone(c, browser)
  await tablet(c, browser)
  return c.failures
}
