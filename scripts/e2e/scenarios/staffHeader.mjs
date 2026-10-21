/**
 * Шапка админа и управляющего. Телефон: шапка не шире экрана, клуб — само название (шторка снизу),
 * тихие кнопки ушли в меню. Мессенджер: вместо «…» — последний клуб ссылкой назад, без переключателя.
 * Монитор: та же кнопка открывает панель под названием.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'шапка админа и управляющего'

const PHONE = {
  viewport: { width: 360, height: 780 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  hasTouch: true,
  isMobile: true,
}
const OTHER_CLUB = 'e2e-club-moscow'
const OTHER_NAME = 'FIT-CITY Москва Центральный'
const ADMIN = { id: 'e2e00000-0000-4000-8000-0000000000b1', login: 'e2e_admin_head', password: randomUUID() }
const SUP = { id: 'e2e00000-0000-4000-8000-0000000000b2', login: 'e2e_sup_head', password: randomUUID() }

function reaches(locator, state = 'visible') {
  return locator
    .waitFor({ state, timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function setup() {
  const seed = trainerClubSeed()
  seed.clubs.push({ id: OTHER_CLUB, name: OTHER_NAME, is_active: true, created_at: new Date().toISOString() })
  const staff = (u, role, club_id) => ({ id: u.id, login: u.login, email: `${u.login}@trainer.local`, password: u.password, role, name: role, club_id, is_active: true })
  const supervisor = staff(SUP, 'supervisor', CLUB_ID)
  supervisor.offer_accepted_at = null
  supervisor.offer_version = null
  seed.users.push(staff(ADMIN, 'admin', null), supervisor)
  return createFakeBackend(seed)
}

const headerFits = (page) =>
  page.evaluate(() => {
    const root = globalThis.document.documentElement
    const right = Math.max(...[...globalThis.document.querySelectorAll('.app-header button, .app-header a')].map((el) => el.getBoundingClientRect().right))
    return { wide: root.scrollWidth - root.clientWidth, right, width: root.clientWidth }
  })

/** Видимые кнопки справа в шапке — размеры «ширина×высота», для проверки «все одного квадрата». */
const buttonSizes = (page) =>
  page.evaluate(() =>
    [...globalThis.document.querySelectorAll('.app-header__right .app-header__tools > *, .app-header__right > button')]
      .map((el) => (el.matches('.app-header__sync-wrap') ? el.querySelector('button') : el))
      .filter((el) => el && el.getBoundingClientRect().width > 0)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return `${Math.round(r.width)}×${Math.round(r.height)}`
      }),
  )

async function adminPhone(c, browser, backend) {
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  try {
    await loginUi(page, ADMIN.login, ADMIN.password)
    const trigger = page.getByTestId('header-club-switch')
    c.ok(await reaches(trigger), 'телефон админа: клуб — кнопка в названии, без отдельного списка')
    c.ok((await page.locator('.app-header select').count()) === 0, 'старого выпадающего списка в шапке нет')
    const fit = await headerFits(page)
    c.ok(fit.wide <= 0 && fit.right <= fit.width, `шапка не шире экрана (лишних ${fit.wide}px, правый край ${Math.round(fit.right)} из ${fit.width})`)
    c.ok(!(await page.getByTestId('header-device-health').isVisible()), 'без сбоев «Сбои устройств» не занимает место — он в меню')
    const phoneSizes = await buttonSizes(page)
    c.ok(phoneSizes.length >= 3 && new Set(phoneSizes).size === 1, `телефон: кнопки шапки одного размера (${phoneSizes.join(', ')})`)
    await screenshot(page, 'staff-header-admin-phone')

    await trigger.click()
    const sheet = page.getByRole('dialog', { name: 'Выбор клуба' })
    c.ok(await reaches(sheet), 'тап по названию — шторка «Клуб»')
    await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
    const box = await sheet.boundingBox()
    c.ok(box && Math.abs(box.y + box.height - 780) <= 2 && box.width >= 359, 'на телефоне — шторка снизу во всю ширину')
    await screenshot(page, 'staff-header-club-sheet')
    await sheet.getByRole('listitem').filter({ hasText: OTHER_NAME }).click()
    c.ok(await reaches(sheet, 'hidden'), 'выбрал клуб — шторка закрылась')
    await page.waitForURL((u) => u.searchParams.get('club') === OTHER_CLUB, { timeout: 5_000 })
    c.ok(await reaches(trigger.filter({ hasText: OTHER_NAME })), 'в шапке новый клуб')

    await page.getByRole('link', { name: /^Сообщения сотрудников/ }).click()
    await page.waitForURL((u) => u.pathname === '/messages')
    const back = page.locator('.app-header__brand-slot a')
    c.ok(await reaches(back), 'мессенджер: название клуба — ссылка, не переключатель')
    c.ok((await page.getByTestId('header-club-switch').count()) === 0, 'мессенджер: клуб тут не переключают')
    c.ok((await back.innerText()).includes('FIT-CITY'), `мессенджер: в шапке последний клуб, не «…» (${(await back.innerText()).trim()})`)
    c.ok(String(await back.getAttribute('href')).includes(`club=${OTHER_CLUB}`), 'ссылка ведёт обратно в этот клуб')
    await screenshot(page, 'staff-header-admin-messenger')
  } catch (e) {
    await screenshot(page, 'staff-header-admin-FAIL').catch(() => null)
    c.ok(false, `админ на телефоне: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function adminMonitor(c, browser, backend) {
  const context = await newE2eContext(browser, backend, { viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await loginUi(page, ADMIN.login, ADMIN.password)
    const trigger = page.getByTestId('header-club-switch')
    await page.getByTestId('header-device-health').waitFor()
    const sizes = await buttonSizes(page)
    c.ok(sizes.length >= 5 && new Set(sizes).size === 1, `монитор: ИСКРА, конверт, «Сбои», Sync и меню — один квадрат (${sizes.join(', ')})`)
    await page.locator('.app-header__right').screenshot({ path: 'qa-screenshots/e2e/staff-header-buttons.png' })
    await trigger.click()
    const panel = page.getByRole('dialog', { name: 'Выбор клуба' })
    c.ok(await reaches(panel), 'монитор: панель выбора клуба')
    const [t, p] = [await trigger.boundingBox(), await panel.boundingBox()]
    c.ok(p && t && p.y >= t.y + t.height && p.y < t.y + t.height + 20 && Math.abs(p.x - t.x) < 12, 'монитор: панель прямо под названием клуба')
    await screenshot(page, 'staff-header-club-panel')
    await page.keyboard.press('Escape')
    c.ok(await reaches(panel, 'hidden'), 'Esc закрывает панель')
  } catch (e) {
    await screenshot(page, 'staff-header-monitor-FAIL').catch(() => null)
    c.ok(false, `админ на мониторе: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function supervisorPhone(c, browser, backend) {
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  try {
    await loginUi(page, SUP.login, SUP.password)
    const offer = page.getByRole('dialog', { name: 'Условия доступа' })
    const brand = page.locator('.app-header__brand-slot a')
    await offer.or(brand).first().waitFor({ state: 'visible', timeout: 15_000 })
    if (await offer.isVisible().catch(() => false)) {
      await offer.getByRole('checkbox').check()
      await offer.getByRole('button', { name: 'Принимаю и продолжаю' }).click()
      await offer.waitFor({ state: 'hidden', timeout: 15_000 })
    }
    c.ok(await reaches(brand.filter({ hasText: 'E2E клуб' })), 'управляющий: в шапке название своего клуба')
    const fit = await headerFits(page)
    c.ok(fit.wide <= 0 && fit.right <= fit.width, `управляющий на телефоне: шапка не шире экрана (лишних ${fit.wide}px)`)
    await page.getByRole('button', { name: 'Меню аккаунта' }).click()
    c.ok(await reaches(page.locator('#app-header-account-menu').getByRole('link', { name: 'Продажи' })), 'в меню управляющего есть «Продажи», как в верхнем меню')
    await screenshot(page, 'staff-header-supervisor-phone')
  } catch (e) {
    await screenshot(page, 'staff-header-supervisor-FAIL').catch(() => null)
    c.ok(false, `управляющий на телефоне: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('staff-header')
  const backend = setup()
  await adminPhone(c, browser, backend)
  await adminMonitor(c, browser, backend)
  await supervisorPhone(c, browser, backend)
  return c.failures
}
