/**
 * Приложение клиента /me на iPhone: без входа → чужая ссылка → вход по ссылке → главная и баннер
 * установки → «Позже» → перезагрузка → нет связи → тренировки по абонементу → окно тренировки. Слой сотрудника (trainer-pull, Auth) не трогается.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, TRAINER_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'

export const name = 'клиент /me: вход по ссылке, баннеры, главная'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const INVITE = 'e2e-invite-token'
const INSTALL_BANNER = 'Установите приложение клуба'

function visible(page, text) {
  return page
    .getByText(text)
    .first()
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false,
    )
}

/** Плитка «Мой абонемент» показывает «6 из 8» — цифра и подпись в разных элементах. */
async function membershipShows(page, re) {
  const tile = page.locator('section', { has: page.getByRole('heading', { name: 'Мой абонемент' }) })
  const until = Date.now() + 10_000
  while (Date.now() < until) {
    const text = ((await tile.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ')
    if (re.test(text)) return true
    await page.waitForTimeout(250)
  }
  return false
}

function reaches(locator, state) {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

export async function run(browser) {
  const c = createChecks('client-me')
  const backend = createFakeBackend(completedTodaySeed())
  backend.clientMe = createFakeClientPortal(backend.state, {
    clientId: CLIENT_ID,
    inviteToken: INVITE,
    today: isoDay(0),
    schedule: [{ day_date: isoDay(2), start_minutes: 600, duration_minutes: 60, trainer_id: TRAINER_ID }],
  })
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/me`)
    c.ok(await visible(page, 'Вход по ссылке из клуба'), 'без входа — подсказка «Вход по ссылке из клуба»')

    await page.goto(`${ORIGIN}/me/join#t=not-our-token`)
    c.ok(await visible(page, 'Не получилось войти'), 'чужая ссылка — «Не получилось войти»')
    c.ok(await visible(page, 'Ссылка недействительна'), 'и понятная причина от сервера')

    /* Ссылка из QR открывается заново, а не сменой хеша на той же странице. */
    await page.goto('about:blank')
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
    c.ok(!page.url().includes(INVITE), 'токен ссылки убран из адресной строки')
    c.ok(await membershipShows(page, /6\s*из 8/), 'главная: абонемент «6 из 8» осталось')
    c.ok(await visible(page, '10:00–11:00'), 'главная: следующая тренировка 10:00–11:00')
    c.ok(
      (await page.getByRole('heading', { level: 1 }).textContent()) === CLIENT_NAME,
      'главная открыта на имя клиента',
    )
    const banner = page.getByRole('region', { name: INSTALL_BANNER })
    c.ok(await reaches(banner, 'visible'), 'после входа по ссылке — баннер «Установите приложение клуба»')
    await screenshot(page, 'client-me-home')

    await banner.getByRole('button', { name: 'Позже' }).click()
    c.ok(await reaches(banner, 'hidden'), '«Позже» прячет баннер')
    await page.reload()
    c.ok(await membershipShows(page, /6\s*из 8/), 'после перезагрузки вход сохранился')
    await page.waitForTimeout(500)
    c.ok(await banner.isHidden(), 'отложенный баннер не возвращается до следующего захода')

    backend.cloudDown = true
    await page.reload()
    c.ok(await visible(page, 'Нет связи — показаны данные на'), 'без сети — плашка «Нет связи» и данные из кэша')
    c.ok(await membershipShows(page, /6\s*из 8/), 'без сети абонемент всё ещё виден')
    backend.cloudDown = false

    await page.getByRole('link', { name: 'Тренировки по абонементу' }).click()
    await page.waitForURL(`${ORIGIN}/me/trainings`, { timeout: 10_000 })
    c.ok(await visible(page, 'Списано 2 из 8'), 'тренировки по абонементу: «Списано 2 из 8» — как цифра на главной')
    c.ok((await page.locator('.client-trainings__row').count()) === 2, 'в списке две строки — по одной на списание')
    await screenshot(page, 'client-me-trainings')
    await page.locator('.client-trainings__open').first().click()
    c.ok(await visible(page, 'Жим лёжа'), 'нажал на тренировку — окно с упражнениями')
    await screenshot(page, 'client-me-training-view')

    const staff = backend.state.requestLog.filter((l) => /\/auth\/v1|\/rest\/v1|trainer-pull|me-profile|push-record/.test(l))
    c.ok(staff.length === 0, `клиент не ходит в API сотрудника (${staff.join(', ') || 'нет'})`)
    c.ok(pageErrors.length === 0, `без ошибок JS на странице${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'client-me-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
