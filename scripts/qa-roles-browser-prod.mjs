/**
 * Full browser QA for qa_auto_* users on production.
 * node scripts/qa-roles-browser-prod.mjs [--skip-wait] [--skip-setup]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  QA_CLUB_ID,
  QA_PASSWORD,
  QA_PREFIX,
  PROD_ORIGIN,
  createSupabaseAdmin,
  upsertQaUser,
} from './lib/qaSupabaseAdmin.mjs'

const ORIGIN = process.env.QA_ORIGIN ?? PROD_ORIGIN
const skipWait = process.argv.includes('--skip-wait')
const skipSetup = process.argv.includes('--skip-setup')
const root = fileURLToPath(new URL('..', import.meta.url))
const shotDir = join(root, 'qa-screenshots', 'roles-browser-prod')
mkdirSync(shotDir, { recursive: true })

const USERS = {
  admin: `${QA_PREFIX}admin`,
  trainer: `${QA_PREFIX}trainer`,
  sales: `${QA_PREFIX}sales`,
}

const report = {
  origin: ORIGIN,
  timestamp: new Date().toISOString(),
  screenshotDir: shotDir,
  roles: {},
  consoleIssues: [],
}

const GOTO_OPTS = { waitUntil: 'load', timeout: 90000 }

function addCheck(role, id, pass, detail = '') {
  if (!report.roles[role]) report.roles[role] = { checks: [], screenshots: [] }
  report.roles[role].checks.push({ id, pass: !!pass, detail })
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${role} / ${id}${detail ? `: ${detail}` : ''}`)
}

function pathname(url) {
  try {
    return new URL(url).pathname.replace(/\/$/, '') || '/'
  } catch {
    return url
  }
}

async function shot(page, role, name) {
  const path = join(shotDir, `${role}-${name}.png`)
  await page.screenshot({ path, fullPage: true })
  report.roles[role]?.screenshots?.push(path)
  console.log(`    📸 ${name}.png`)
}

function attachConsole(page, role) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleIssues.push({ role, type: 'console.error', text: msg.text() })
    }
  })
  page.on('pageerror', (err) => {
    report.consoleIssues.push({ role, type: 'pageerror', text: err.message })
  })
}

async function waitAppReady(page) {
  await page.waitForSelector('.app-header, .sales-header, .login-page', { timeout: 30000 })
  await page.waitForSelector('.app-welcome-splash', { state: 'detached', timeout: 30000 }).catch(() => null)
  await page.waitForTimeout(800)
}

async function goto(page, path) {
  await page.goto(`${ORIGIN}${path}`, GOTO_OPTS)
  await waitAppReady(page)
}

async function clickAdminNav(page, label) {
  await page.locator('.app-header__nav').getByRole('link', { name: label }).click()
  await page.waitForTimeout(1200)
}

async function login(page, loginName, expectedPath, maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto(`${ORIGIN}/login`, GOTO_OPTS)
    await page.fill('#login', loginName)
    await page.fill('#password', QA_PASSWORD)
    await page.click('button[type="submit"]')
    try {
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 })
      await page.waitForTimeout(2000)
      const url = page.url()
      if (pathname(url) === expectedPath) return { ok: true, url, attempt }
    } catch {
      /* retry */
    }
    const errText = await page.locator('[role="alert"]').textContent().catch(() => '')
    if (attempt < maxAttempts) {
      console.log(`    retry login ${loginName} (${attempt}/${maxAttempts})${errText ? `: ${errText.trim()}` : ''}`)
      await page.waitForTimeout(5000)
    } else {
      return { ok: false, url: page.url(), attempt, error: errText?.trim() || 'login timeout' }
    }
  }
  return { ok: false, url: page.url(), attempt: maxAttempts }
}

async function openAppMenu(page) {
  await page.locator('.app-header__burger').click()
  await page.waitForSelector('.app-header__menu-item--danger', { timeout: 8000 })
}

async function signOutAppHeader(page) {
  await openAppMenu(page)
  await page.locator('.app-header__menu-item--danger').click()
  await page.waitForURL(/\/login/, { timeout: 15000 })
}

async function signOutSales(page) {
  await page.locator('button[title="Выйти"]').click()
  await page.waitForURL(/\/login/, { timeout: 15000 })
}

async function testAdmin(context) {
  const role = 'admin'
  report.roles[role] = { checks: [], screenshots: [] }
  const page = await context.newPage()
  attachConsole(page, role)

  try {
    const loginRes = await login(page, USERS.admin, '/admin')
    await shot(page, role, '01-after-login')
    addCheck(role, '1-login-redirect-admin', loginRes.ok, loginRes.url)
    if (!loginRes.ok) return
    await waitAppReady(page)

    await clickAdminNav(page, 'Клиенты')
    await page.waitForSelector('.admin-clients-search-row', { timeout: 20000 }).catch(() => null)
    await shot(page, role, '02-nav-clients')
    addCheck(role, '2-nav-clients', pathname(page.url()) === '/admin/clients', page.url())

    await clickAdminNav(page, 'Статистика')
    await page.waitForSelector('.admin-club-stats, .admin-statistics', { timeout: 20000 }).catch(() => null)
    await shot(page, role, '03-nav-statistics')
    addCheck(role, '2-nav-statistics', pathname(page.url()) === '/admin/statistics', page.url())

    await clickAdminNav(page, 'Структура')
    await page.waitForSelector('#admin-structure-tab-trainers', { timeout: 20000 }).catch(() => null)
    await page.locator('#admin-structure-tab-trainers').click()
    await page.waitForTimeout(800)
    await shot(page, role, '04-nav-structure-trainers')
    addCheck(
      role,
      '2-nav-structure-trainers',
      pathname(page.url()) === '/admin/structure' && (await page.locator('#admin-structure-panel-trainers:not([hidden])').count()) > 0,
      page.url(),
    )

    await clickAdminNav(page, 'Главная')
    await page.locator('.feature-tile').filter({ hasText: 'Продажи' }).click()
    await page.waitForURL(/\/admin\/sales/, { timeout: 15000 })
    await page.waitForSelector('#sales-tab-daily, .sales-report', { timeout: 20000 }).catch(() => null)
    await shot(page, role, '05-nav-sales')
    addCheck(role, '2-nav-sales', pathname(page.url()) === '/admin/sales', page.url())

    const hasFinance = (await page.locator('#sales-tab-finance').count()) > 0
    addCheck(role, '3-sales-finance-tab-visible', hasFinance)

    await page.locator('#sales-tab-stats').click()
    await page.waitForTimeout(800)
    addCheck(role, '3-sales-switch-stats-tab', (await page.locator('#sales-panel-stats').count()) > 0)
    await shot(page, role, '03-sales-stats-tab')

    await page.locator('#sales-tab-finance').click()
    await page.waitForTimeout(800)
    addCheck(role, '3-sales-switch-finance-tab', (await page.locator('#sales-panel-finance').count()) > 0)
    await shot(page, role, '04-sales-finance-tab')

    await signOutAppHeader(page)
    await shot(page, role, '05-after-logout')
    addCheck(role, '4-sign-out', page.url().includes('/login'), page.url())
  } catch (e) {
    addCheck(role, 'fatal', false, e.message)
    await shot(page, role, '99-error').catch(() => {})
  } finally {
    await page.close()
  }
}

async function testTrainer(context) {
  const role = 'trainer'
  report.roles[role] = { checks: [], screenshots: [] }
  const page = await context.newPage()
  attachConsole(page, role)

  try {
    const loginRes = await login(page, USERS.trainer, '/trainer')
    await shot(page, role, '01-after-login')
    addCheck(role, '1-login-redirect-trainer', loginRes.ok, loginRes.url)
    if (!loginRes.ok) return

    const homeLoaded = (await page.locator('.trainer-home, .trainer-dashboard, main h1, .section-title').count()) > 0
    await shot(page, role, '02-home')
    addCheck(role, '2-home-loads', homeLoaded)

    await page.locator('.app-header__nav').getByRole('link', { name: 'Клиенты' }).click()
    await page.waitForTimeout(1200)
    await shot(page, role, '03-clients')
    addCheck(role, '2-clients-accessible', pathname(page.url()) === '/trainer/clients', page.url())

    await goto(page, '/admin')
    await shot(page, role, '04-blocked-admin')
    addCheck(role, '3-blocked-admin', pathname(page.url()) === '/trainer', page.url())

    await goto(page, '/sales')
    await shot(page, role, '05-blocked-sales')
    addCheck(role, '4-blocked-sales', pathname(page.url()) === '/trainer', page.url())

    await signOutAppHeader(page)
    await shot(page, role, '06-after-logout')
    addCheck(role, '5-sign-out', page.url().includes('/login'), page.url())
  } catch (e) {
    addCheck(role, 'fatal', false, e.message)
    await shot(page, role, '99-error').catch(() => {})
  } finally {
    await page.close()
  }
}

async function testSales(context) {
  const role = 'sales'
  report.roles[role] = { checks: [], screenshots: [] }
  const page = await context.newPage()
  attachConsole(page, role)

  try {
    const loginRes = await login(page, USERS.sales, '/sales')
    await shot(page, role, '01-after-login')
    addCheck(role, '1-login-redirect-sales', loginRes.ok, loginRes.url)
    if (!loginRes.ok) return

    await page.waitForSelector('.sales-header', { timeout: 15000 })
    const headerText = await page.locator('.sales-header').textContent()
    const clubLabel = (await page.locator('.sales-header__club').textContent())?.trim()
    await shot(page, role, '02-header')
    addCheck(role, '2-header-prodazhi', headerText.includes('Продажи'))
    addCheck(role, '2-header-club-name', Boolean(clubLabel && clubLabel !== '—'), clubLabel || '—')
    addCheck(role, '2-no-finance-tab', (await page.locator('.sales-header').locator('text=Финансы').count()) === 0)

    await page.click('a[href="/sales?tab=stats"]')
    await page.waitForURL(/tab=stats/, { timeout: 10000 })
    await page.waitForTimeout(1500)
    await shot(page, role, '03-stats-tab')
    addCheck(role, '3-stats-tab-works', (await page.locator('#sales-stats-title, .sales-report__stats').count()) > 0)

    let dayNavOk = false
    let dayDetail = ''
    const dayRow = page.locator('.sales-report__day-table tbody tr').first()
    if ((await dayRow.count()) > 0) {
      await dayRow.click()
      await page.waitForTimeout(1200)
      dayNavOk = !page.url().includes('tab=stats')
      dayDetail = page.url()
    } else {
      dayNavOk = true
      dayDetail = 'no day rows — skipped click'
    }
    await shot(page, role, '04-day-click')
    addCheck(role, '3-stats-day-navigates-daily', dayNavOk, dayDetail)

    await goto(page, '/admin')
    await shot(page, role, '05-blocked-admin')
    addCheck(role, '4-blocked-admin', pathname(page.url()) === '/sales', page.url())

    await goto(page, '/sales')
    await signOutSales(page)
    await shot(page, role, '06-after-logout')
    addCheck(role, '5-sign-out', page.url().includes('/login'), page.url())
  } catch (e) {
    addCheck(role, 'fatal', false, e.message)
    await shot(page, role, '99-error').catch(() => {})
  } finally {
    await page.close()
  }
}

async function ensureUsers() {
  if (skipSetup) return
  const admin = createSupabaseAdmin()
  for (const spec of [
    { login: USERS.admin, role: 'admin', name: 'QA Admin', club_id: null },
    { login: USERS.trainer, role: 'trainer', name: 'QA Trainer', club_id: QA_CLUB_ID },
    { login: USERS.sales, role: 'sales_manager', name: 'QA Sales', club_id: QA_CLUB_ID },
  ]) {
    const row = await upsertQaUser(admin, spec)
    console.log(`  ${row.action}: ${row.login}`)
  }
}

async function main() {
  console.log(`▶ Browser QA on ${ORIGIN}`)
  if (!skipWait) {
    console.log('⏳ Waiting 30s for qa_auto_* user creation…')
    await new Promise((r) => setTimeout(r, 30000))
  }
  console.log('▶ ensure QA users')
  await ensureUsers()

  const browser = await chromium.launch({ headless: true })
  const ctxOpts = { viewport: { width: 1280, height: 900 }, locale: 'ru-RU' }

  try {
    console.log('\n=== qa_auto_admin ===')
    await testAdmin(await browser.newContext(ctxOpts))
    console.log('\n=== qa_auto_trainer ===')
    await testTrainer(await browser.newContext(ctxOpts))
    console.log('\n=== qa_auto_sales ===')
    await testSales(await browser.newContext(ctxOpts))
  } finally {
    await browser.close()
  }

  let total = 0
  let failed = 0
  for (const data of Object.values(report.roles)) {
    for (const c of data.checks) {
      total++
      if (!c.pass) failed++
    }
  }
  report.summary = { total, passed: total - failed, failed }

  const reportPath = join(shotDir, 'report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('\n' + '='.repeat(60))
  console.log(`Checks: ${total} | PASS: ${total - failed} | FAIL: ${failed}`)
  console.log(`Console issues: ${report.consoleIssues.length}`)
  console.log(`Report: ${reportPath}`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
