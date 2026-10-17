/**
 * Карточка клиента на планшете: конвертик без приложения → QR-приглашение;
 * с живым входом → переписка (в шапке имя клиента, без подписи «Тренер»).
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { openClientCard, tapSync } from '../lib/trainerSteps.mjs'
import { CLIENT_ID, CLIENT_NAME, TRAINER_LOGIN, TRAINER_PASSWORD, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'карточка: конвертик без приложения — QR, с приложением — чат'

const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 12_000 })
    .then(() => true)
    .catch(() => false)
}

async function openTrainer(browser, backend) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
  await tapSync(page)
  return { context, page, pageErrors }
}

/** Нет живой сессии → конвертик зовёт пригласить, не открывает пустой чат. */
async function withoutApp(c, browser) {
  const backend = createFakeBackend(trainerClubSeed())
  backend.state.client_sessions = []
  const { context, page, pageErrors } = await openTrainer(browser, backend)
  try {
    await openClientCard(page, CLIENT_ID)
    const inviteBtn = page.getByRole('button', { name: 'Сначала пригласите в приложение' })
    c.ok(await reaches(inviteBtn), 'без приложения: конвертик — «Сначала пригласите в приложение»')
    c.ok((await page.getByRole('link', { name: 'Написать клиенту' }).count()) === 0, 'без приложения: ссылки в чат нет')
    await inviteBtn.click()
    const modal = page.getByRole('dialog', { name: 'Приложение клиента' })
    c.ok(await reaches(modal.getByRole('img', { name: 'QR-код для входа клиента' })), 'конвертик открыл QR входа в /me')
    c.ok(backend.state.client_invites.at(-1)?.client_id === CLIENT_ID, 'сервер выдал ссылку этому клиенту')
    await screenshot(page, 'client-card-chat-invite-no-app')
    await modal.getByRole('button', { name: 'Закрыть' }).click()
    c.ok(!page.url().includes('/messages/chat/'), 'после QR адрес чата не открывался')
    c.ok(pageErrors.length === 0, `без приложения: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'client-card-chat-invite-no-app-FAIL').catch(() => null)
    c.ok(false, `без приложения: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/** Есть вход → конвертик ведёт в переписку; в шапке только имя клиента. */
async function withApp(c, browser) {
  const backend = createFakeBackend(trainerClubSeed())
  backend.state.client_sessions = [{ client_id: CLIENT_ID, revoked_at: null }]
  const chat = createFakeChat(backend.state)
  backend.adminData = (req, user) => chat.staff(req, user)
  const { context, page, pageErrors } = await openTrainer(browser, backend)
  try {
    await openClientCard(page, CLIENT_ID)
    const writeLink = page.getByRole('link', { name: 'Написать клиенту' })
    c.ok(await reaches(writeLink), 'с приложением: конвертик — «Написать клиенту»')
    await writeLink.click()
    await page.waitForURL(`${ORIGIN}/messages/chat/${CLIENT_ID}/trainer`, { timeout: 15_000 })
    const head = page.locator('.chat-bar')
    c.ok(await reaches(head.getByRole('heading', { name: CLIENT_NAME })), 'чат: в шапке имя клиента')
    c.ok((await head.locator('.chat-bar__sub').count()) === 0, 'чат: подписи «Тренер» в шапке нет')
    await screenshot(page, 'client-card-chat-invite-with-app')
    c.ok(pageErrors.length === 0, `с приложением: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'client-card-chat-invite-with-app-FAIL').catch(() => null)
    c.ok(false, `с приложением: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('client-card-chat-invite')
  await withoutApp(c, browser)
  await withApp(c, browser)
  return c.failures
}
