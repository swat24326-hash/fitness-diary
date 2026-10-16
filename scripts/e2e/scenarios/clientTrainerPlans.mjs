/**
 * Задание от тренера в приложение клиента — склейка трёх экранов через сервер:
 * тренер на планшете собирает ДЗ → «В приложение» → запись уходит через очередь sync →
 * клиент на телефоне видит вкладку «От тренера» с точкой «новое» → открывает упражнения, переключает на «Питание» →
 * тренер после Sync видит «Клиент открыл».
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'
import { openClientCard, openTrainerSession, tapSync } from '../lib/trainerSteps.mjs'

export const name = 'задание от тренера: планшет → приложение клиента → «Клиент открыл»'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const INVITE = 'e2e-plans-invite'

function reaches(locator) {
  return locator
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

async function clientOpensTask(c, browser, backend) {
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
    const notif = page.getByRole('link', { name: 'Уведомления: новых 1' })
    c.ok(await reaches(notif), 'клиент: в шапке колокольчик с новыми')
    await notif.click()
    await page.waitForURL(`${ORIGIN}/me/notifications`, { timeout: 10_000 })
    c.ok(await reaches(page.getByRole('link', { name: /Новое задание/ })), 'клиент: в ленте «Новое задание»')
    await screenshot(page, 'client-plans-notifications')
    await page.getByRole('link', { name: 'Главная', exact: true }).click()
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 10_000 })
    const tab = page.getByRole('link', { name: 'Задание и питание от тренера, новое' })
    c.ok(await reaches(tab), 'клиент: внизу вкладка «От тренера» с точкой «Новое»')
    await screenshot(page, 'client-plans-home')
    await tab.click()
    await page.waitForURL(`${ORIGIN}/me/task`, { timeout: 10_000 })
    c.ok(await reaches(page.getByText('Жим лёжа')), 'клиент: открыл задание — упражнение из справочника')
    c.ok(await reaches(page.getByText('Через день, без боли')), 'клиент: комментарий тренера клиенту')
    c.ok(await reaches(page.getByRole('link', { name: 'Задание и питание от тренера', exact: true })), 'клиент: открыл — точка на вкладке гаснет')
    await screenshot(page, 'client-plans-task')
    await page.getByRole('link', { name: 'Питание', exact: true }).click()
    await page.waitForURL(`${ORIGIN}/me/nutrition`, { timeout: 10_000 })
    c.ok(await reaches(page.getByText('Рациона пока нет')), 'клиент: «Питание» в той же вкладке — пока пусто')
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('client-plans')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, completedTodaySeed())
  backend.clientMe = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: INVITE, today: isoDay(0) })
  try {
    await openClientCard(page, CLIENT_ID)
    await page.goto(`${ORIGIN}/trainer/clients/${CLIENT_ID}?tab=homework`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: 'Собрать сам' }).click()
    await page.locator('.homework-builder__opt', { hasText: 'Жим лёжа' }).click()
    await page.getByLabel('Комментарий клиенту (по желанию)').fill('Через день, без боли')
    await page.getByRole('button', { name: 'В приложение', exact: true }).click()
    c.ok(await reaches(page.getByText(/^Отправлено \d\d\.\d\d, \d\d:\d\d/)), 'тренер: под кнопкой «Отправлено дд.мм, чч:мм»')
    const delivered = await waitFor(() => (backend.state.client_plans ?? []).some((p) => p.client_id === CLIENT_ID), 15_000)
    c.ok(delivered, 'задание ушло на сервер через очередь sync')
    await screenshot(page, 'client-plans-trainer-sent')

    await clientOpensTask(c, browser, backend)

    await tapSync(page)
    c.ok(await reaches(page.getByText(/^Клиент открыл \d\d\.\d\d, \d\d:\d\d/)), 'тренер: после Sync — «Клиент открыл»')
    await screenshot(page, 'client-plans-trainer-seen')
    c.ok(pageErrors.length === 0, `без ошибок JS у тренера${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'client-plans-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
