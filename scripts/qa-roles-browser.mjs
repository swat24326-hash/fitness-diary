/**
 * Browser QA all roles on prod. Requires: npx playwright install chromium
 * node scripts/qa-roles-browser.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QA_CLUB_ID, QA_PASSWORD, QA_PREFIX, PROD_ORIGIN, createSupabaseAdmin, deleteQaUsers, upsertQaUser } from './lib/qaSupabaseAdmin.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const shotDir = join(root, 'qa-screenshots', 'roles-prod')
mkdirSync(shotDir, { recursive: true })

let failed = 0
const report = []

function fail(msg, role) {
  console.error(`FAIL [${role}]: ${msg}`)
  failed++
  return msg
}

async function login(page, loginName) {
  await page.goto(`${PROD_ORIGIN}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('#login', { state: 'visible', timeout: 15000 })
  await page.locator('#login').fill(loginName)
  await page.locator('#password').fill(QA_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45000 })
  await page.waitForLoadState('networkidle').catch(() => null)
}

async function ensureAdminClub(page) {
  await page.waitForSelector('.app-header__club-select', { timeout: 20000 })
  const select = page.locator('.app-header__club-select')
  const hasQa = await select.locator(`option[value="${QA_CLUB_ID}"]`).count()
  if (hasQa > 0) {
    await select.selectOption(QA_CLUB_ID)
  } else {
    const firstVal = await select.locator('option[value]:not([value=""])').first().getAttribute('value')
    if (firstVal) await select.selectOption(firstVal)
  }
  await page.waitForTimeout(800)
}

async function testAdmin(page) {
  const role = 'admin'
  const obs = []
  await login(page, `${QA_PREFIX}admin`)
  const url = page.url()
  if (!url.includes('/admin')) obs.push(fail(`expected /admin, got ${url}`, role))
  else obs.push('redirect /admin ok')

  await ensureAdminClub(page)
  const club = await page.locator('.app-header__club-select').inputValue()
  if (!club) obs.push(fail('admin club not selected', role))

  await page.goto(`${PROD_ORIGIN}/admin/clients?club=${encodeURIComponent(club)}`, { waitUntil: 'domcontentloaded' })
  obs.push(page.url().includes('/admin/clients') ? 'clients page ok' : fail('clients page', role))

  const salesLink = page.locator(`a[href="/admin/sales?club=${encodeURIComponent(club)}"], a[href*="/admin/sales"]`).first()
  if ((await salesLink.count()) === 0) {
    await page.goto(`${PROD_ORIGIN}/admin?club=${encodeURIComponent(club)}`, { waitUntil: 'domcontentloaded' })
    await page.locator('a[href*="/admin/sales"]').first().click()
  } else {
    await salesLink.click()
  }
  await page.waitForURL(/\/admin\/sales/, { timeout: 20000 })
  await page.waitForSelector('.sales-report, .sales-report__hero, .sales-report__tabs', { timeout: 30000 }).catch(() => null)
  await page.waitForSelector('#sales-tab-finance', { timeout: 30000 }).catch(() => null)
  await page.waitForTimeout(1500)
  const financeTab = await page.locator('#sales-tab-finance').count()
  obs.push(financeTab > 0 ? 'finance tab visible' : fail('finance tab missing for admin', role))
  await page.screenshot({ path: join(shotDir, 'admin-sales.png'), fullPage: true })

  report.push({ role, pass: !obs.some((o) => o.startsWith('FAIL')), obs })
}

async function testTrainer(page) {
  const role = 'trainer'
  const obs = []
  await login(page, `${QA_PREFIX}trainer`)
  obs.push(page.url().includes('/trainer') ? 'redirect /trainer ok' : fail(`url ${page.url()}`, role))

  await page.goto(`${PROD_ORIGIN}/trainer/clients`, { waitUntil: 'domcontentloaded' })
  obs.push(page.url().includes('/trainer/clients') ? 'clients list ok' : fail('trainer clients', role))

  await page.goto(`${PROD_ORIGIN}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  obs.push(!page.url().includes('/admin') ? 'blocked from admin' : fail(`admin accessible: ${page.url()}`, role))

  await page.goto(`${PROD_ORIGIN}/sales`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  obs.push(!page.url().includes('/sales') ? 'blocked from sales' : fail(`sales accessible: ${page.url()}`, role))

  report.push({ role, pass: !obs.some((o) => o.startsWith('FAIL')), obs })
}

async function testSales(page) {
  const role = 'sales'
  const obs = []
  await login(page, `${QA_PREFIX}sales`)
  obs.push(page.url().includes('/sales') && !page.url().includes('/admin') ? 'redirect /sales ok' : fail(`url ${page.url()}`, role))

  const headerOk = await page
    .waitForSelector('.sales-header__title, .app-header', { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  obs.push(headerOk ? 'sales header ok' : fail('sales header missing', role))

  const financeNav = await page.locator('a[href*="tab=finance"], #sales-tab-finance').count()
  obs.push(financeNav === 0 ? 'no finance in header' : fail('finance in header', role))

  const statsLink = page.locator('a[href="/sales?tab=stats"]')
  if ((await statsLink.count()) === 0) {
    obs.push(fail('stats nav link missing', role))
  } else {
    await statsLink.first().click()
    await page.waitForURL(/tab=stats/, { timeout: 15000 }).catch(() => null)
    obs.push(page.url().includes('tab=stats') ? 'stats tab ok' : fail('stats tab navigation', role))
  }

  const dayBtn = page.locator('.sales-report__day-table tbody tr button, .sales-report__day-table tbody tr').first()
  if (await dayBtn.count()) {
    await dayBtn.click()
    await page.waitForTimeout(800)
    obs.push(!page.url().includes('tab=stats') ? 'day click -> daily ok' : fail('day click navigation', role))
  } else {
    obs.push('day table empty (skip click test)')
  }

  await page.goto(`${PROD_ORIGIN}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  obs.push(!page.url().includes('/admin') ? 'blocked from admin' : fail(`admin accessible: ${page.url()}`, role))

  await page.screenshot({ path: join(shotDir, 'sales-daily.png'), fullPage: true })
  report.push({ role, pass: !obs.some((o) => o.startsWith('FAIL')), obs })
}

const browser = await chromium.launch({ headless: true })
const admin = createSupabaseAdmin()
for (const spec of [
  { login: `${QA_PREFIX}admin`, role: 'admin', name: 'QA Admin', club_id: null },
  { login: `${QA_PREFIX}trainer`, role: 'trainer', name: 'QA Trainer', club_id: QA_CLUB_ID },
  { login: `${QA_PREFIX}sales`, role: 'sales_manager', name: 'QA Sales', club_id: QA_CLUB_ID },
]) {
  await upsertQaUser(admin, spec)
}

try {
  for (const [, fn] of [
    ['admin', testAdmin],
    ['trainer', testTrainer],
    ['sales', testSales],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' })
    const page = await context.newPage()
    try {
      await fn(page)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
  await deleteQaUsers(admin)
}

console.log('\n--- browser report ---')
for (const r of report) {
  console.log(`\n${r.role}: ${r.pass ? 'PASS' : 'FAIL'}`)
  for (const o of r.obs) console.log(`  - ${o}`)
}

process.exit(failed > 0 ? 1 : 0)
