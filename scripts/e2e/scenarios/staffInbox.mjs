/**
 * «Сообщения клуба» сотрудника: тренер на планшете видит конверт с числом новых → объявление →
 * опрос (пропуск вопроса подсвечен, ответ уходит) → конверт гаснет. Админ собирает рассылку команде.
 * Стойка: в карточке клиента баллы за опросы, часть меняется на подарок.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeInbox } from '../lib/fakeInbox.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { openClientCard, tapSync } from '../lib/trainerSteps.mjs'
import { CLIENT_ID, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'сотрудник: сообщения клуба и опрос'

const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true }
const MONITOR = { viewport: { width: 1440, height: 900 } }
const ADMIN_LOGIN = 'e2e_admin'
const ADMIN_PASSWORD = randomUUID()

function seed() {
  const s = trainerClubSeed()
  s.users.push({
    id: 'e2e00000-0000-4000-8000-0000000000a9',
    login: ADMIN_LOGIN,
    email: `${ADMIN_LOGIN}@trainer.local`,
    password: ADMIN_PASSWORD,
    role: 'admin',
    name: 'Админ Сети',
    club_id: CLUB_ID,
  })
  return s
}

function inboxSeed() {
  const sent = new Date(Date.now() - 3600_000).toISOString()
  const expires = new Date(Date.now() + 7 * 864e5).toISOString()
  return {
    campaigns: [
      {
        id: 'camp-survey',
        kind: 'survey',
        audience: 'staff',
        title: 'Как вам новое расписание смен?',
        body: 'Пара вопросов — займёт минуту.',
        questions: [
          { id: 'q1', type: 'rating', text: 'Насколько удобно расписание?', required: true },
          { id: 'q2', type: 'single', text: 'Какая смена удобнее?', options: ['Утро', 'Вечер'], required: true },
        ],
        reward_points: 0,
        expires_at: expires,
      },
      { id: 'camp-client', kind: 'survey', audience: 'clients', title: 'Как вам клуб?', body: '', questions: [], reward_points: 50, expires_at: expires },
      { id: 'camp-notice', kind: 'notice', audience: 'staff', title: 'Планёрка в пятницу в 9:00', body: 'Собираемся в зале ТЗ.', questions: [], reward_points: 0, expires_at: expires },
    ],
    deliveries: [
      { id: 'd-survey', campaign_id: 'camp-survey', user_id: TRAINER_ID, created_at: sent },
      { id: 'd-notice', campaign_id: 'camp-notice', user_id: TRAINER_ID, created_at: sent },
      { id: 'd-client', campaign_id: 'camp-client', client_id: CLIENT_ID, created_at: sent, answered_at: sent, reward_points: 50, reward_granted_at: sent },
    ],
  }
}

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

async function trainerFlow(c, browser, backend) {
  const context = await newE2eContext(browser, backend, TABLET)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    const envelope = page.getByRole('link', { name: /^Сообщения клуба/ })
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения клуба: 2 новых' })), 'шапка тренера: конверт «2 новых»')
    const icon = await envelope.locator('svg').boundingBox()
    const badge = await envelope.locator('.app-header__inbox-badge').evaluate((el) => el.ownerDocument.defaultView.getComputedStyle(el).position)
    c.ok(icon?.width >= 16 && badge === 'absolute', 'конверт: значок виден, число в углу (стили шапки без панели ИСКРЫ)')
    await envelope.click()
    await page.waitForURL(`${ORIGIN}/messages`)
    c.ok(await reaches(page.getByText('Планёрка в пятницу в 9:00')), 'список: объявление на месте')
    await page.waitForTimeout(600)
    await screenshot(page, 'staff-inbox-list')

    await page.getByText('Планёрка в пятницу в 9:00').click()
    c.ok(await reaches(page.getByText('Собираемся в зале ТЗ.')), 'объявление открыто целиком')
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения клуба: 1 новых' })), 'прочитал объявление — в конверте 1')

    await page.getByRole('link', { name: 'Все сообщения' }).click()
    await page.getByText('Как вам новое расписание смен?').click()
    await page.getByRole('button', { name: 'Отправить ответы' }).click()
    c.ok(await reaches(page.getByText('Ответьте на этот вопрос')), 'пропущенный вопрос подсвечен, ничего не ушло')
    await page.getByRole('radio', { name: '4 из 5' }).click()
    await page.getByRole('radio', { name: 'Вечер' }).click()
    await screenshot(page, 'staff-inbox-survey')
    await page.getByRole('button', { name: 'Отправить ответы' }).click()
    c.ok(await reaches(page.getByText('Спасибо, ответ отправлен!')), 'ответ отправлен — «Спасибо»')
    const saved = backend.state.inbox.deliveries.find((d) => d.id === 'd-survey')
    c.ok(saved.answers?.q1 === 4 && saved.answers?.q2 === 1, 'на сервер ушли оценка 4 и «Вечер»')
    c.ok(await reaches(page.getByRole('link', { name: 'Сообщения клуба', exact: true })), 'всё прочитано — конверт без числа')
    c.ok(pageErrors.length === 0, `без ошибок JS у тренера${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'staff-inbox-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function adminFlow(c, browser, backend) {
  const context = await newE2eContext(browser, backend, MONITOR)
  const page = await context.newPage()
  try {
    await loginUi(page, ADMIN_LOGIN, ADMIN_PASSWORD)
    await page.goto(`${ORIGIN}/admin/inbox?club=${CLUB_ID}&new=survey`)
    await page.getByRole('radio', { name: 'Команде' }).click()
    c.ok(await reaches(page.getByText('Получат сотрудников: 1')), 'админ: «Команде» — охват по тренерам')
    c.ok(await page.getByText('Баллы за прохождение').isHidden(), 'админ: команде баллы не предлагаем')
    await screenshot(page, 'admin-inbox-staff-composer')

    await page.goto(`${ORIGIN}/admin/inbox?club=${CLUB_ID}&new=survey`)
    await page.getByRole('radio', { name: 'После 10-й тренировки' }).click()
    c.ok(await reaches(page.getByText(/Придёт каждому клиенту с приложением после 10-й тренировки/)), 'автоопрос: охват — правило, а не число')
    c.ok(await page.getByRole('group', { name: 'Залы' }).isHidden(), 'автоопрос: залы не выбираем')
    const when = page.getByRole('radiogroup', { name: 'Когда отправить' })
    c.ok(
      (await when.getByRole('radio', { name: 'После 10-й тренировки' }).getAttribute('aria-checked')) === 'true' &&
        (await when.getByRole('radio', { name: 'Сейчас' }).getAttribute('aria-checked')) === 'false',
      'автоопрос: отмечен «После 10-й тренировки», а не «Сейчас»',
    )
    await page.getByPlaceholder('Например: Как вам тренировки в октябре?').fill('Как вам первые 10 тренировок?')
    await page.getByPlaceholder('Текст вопроса').first().fill('Оцените тренера')
    await screenshot(page, 'admin-inbox-auto-survey')
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Запустить' }).click()
    const sent = () => backend.state.inbox.campaigns.find((x) => x.title === 'Как вам первые 10 тренировок?')
    for (let i = 0; i < 20 && !sent(); i += 1) await page.waitForTimeout(250)
    c.ok(sent()?.trigger === 'trainings_10', 'автоопрос ушёл на сервер с триггером «после 10-й тренировки»')
  } catch (e) {
    await screenshot(page, 'admin-inbox-FAIL').catch(() => null)
    c.ok(false, `админ: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

/** Стойка: админ открывает карточку клиента, видит баллы за опросы и меняет часть на подарок. */
async function deskPointsFlow(c, browser, backend) {
  const context = await newE2eContext(browser, backend, MONITOR)
  const page = await context.newPage()
  try {
    // Карточка админа читает клиента из локальной базы — кладём его туда входом тренера на этом устройстве.
    await loginUi(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await tapSync(page)
    await openClientCard(page, CLIENT_ID)
    await page.evaluate(() => globalThis.localStorage.clear())
    await loginUi(page, ADMIN_LOGIN, ADMIN_PASSWORD)
    await page.goto(`${ORIGIN}/admin/clients/${CLIENT_ID}?club=${CLUB_ID}`)
    const points = page.getByTestId('survey-points')
    const value = points.locator('.survey-points__value')
    c.ok(await reaches(value.filter({ hasText: /^50 баллов$/ })), 'карточка клиента: 50 баллов за опросы')
    await points.getByRole('button', { name: 'Списать' }).click()
    await points.getByLabel('Сколько списать').fill('20')
    await points.getByLabel('За что').fill('Полотенце')
    await screenshot(page, 'survey-points-redeem')
    await points.getByRole('button', { name: 'Списать 20 баллов' }).click()
    c.ok(await reaches(value.filter({ hasText: /^30 баллов$/ })), 'списали 20 — осталось 30')
    c.ok(backend.state.inbox.redemptions?.[0]?.comment === 'Полотенце', 'на сервер ушло списание с комментарием')

    await page.goto(`${ORIGIN}/admin/loyalty?club=${CLUB_ID}`)
    const row = page.locator('.loyalty-journal__row').filter({ hasText: 'Полотенце' })
    c.ok(await reaches(row.getByText('За опросы')), 'журнал баллов: списание за опросы с пометкой источника')
    await screenshot(page, 'loyalty-journal-survey')
  } catch (e) {
    await screenshot(page, 'survey-points-FAIL').catch(() => null)
    c.ok(false, `стойка: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('staff-inbox')
  const backend = createFakeBackend(seed())
  backend.state.inbox = inboxSeed()
  backend.adminData = createFakeInbox(backend.state, backend.state.inbox)
  await trainerFlow(c, browser, backend)
  await adminFlow(c, browser, backend)
  await deskPointsFlow(c, browser, backend)
  return c.failures
}
