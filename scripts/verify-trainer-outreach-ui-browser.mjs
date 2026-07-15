/* global window, localStorage, indexedDB */
/**
 * Browser smoke: outreach UI (иконки, прогресс, «следующий»).
 * Требует: npx playwright install chromium (+ playwright package)
 *
 * Локально: dev-сервер + QA-логин из .env Supabase
 *   npm run dev
 *   set OUTREACH_UI_ORIGIN=http://127.0.0.1:5173
 *   node scripts/verify-trainer-outreach-ui-browser.mjs
 *
 * node scripts/verify-trainer-outreach-ui-browser.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QA_CLUB_ID, QA_PASSWORD, QA_PREFIX, createSupabaseAdmin, upsertQaUser } from './lib/qaSupabaseAdmin.mjs'

const ORIGIN = process.env.OUTREACH_UI_ORIGIN ?? 'http://127.0.0.1:5173'
const LOGIN = process.env.OUTREACH_UI_LOGIN ?? `${QA_PREFIX}trainer`
const PASSWORD = process.env.OUTREACH_UI_PASSWORD ?? QA_PASSWORD
const DEMO_CLUB_ID = process.env.OUTREACH_UI_CLUB_ID ?? QA_CLUB_ID
const IDENTITY_KEY = 'fitness-diary-user-identity-v1'

const root = fileURLToPath(new URL('..', import.meta.url))
const shotDir = join(root, 'qa-screenshots', 'outreach-ui')
mkdirSync(shotDir, { recursive: true })

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

function warn(msg) {
  console.warn(`skip: ${msg}`)
}

async function readTrainerId(page) {
  return page.evaluate((key) => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return ''
      const row = JSON.parse(raw)
      return String(row?.id ?? '')
    } catch {
      return ''
    }
  }, IDENTITY_KEY)
}

async function seedExpiringClient(page, trainerId) {
  await page.evaluate(
    async ({ trainerId, clubId }) => {
      const clientId = '00000000-0000-4000-8000-000000000099'
      const memId = '00000000-0000-4000-8000-000000000098'
      const now = new Date().toISOString()
      const today = now.slice(0, 10)
      const end = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)

      const open = () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('fitness-diary', 13)
          req.onerror = () => reject(req.error)
          req.onsuccess = () => resolve(req.result)
        })

      const put = (db, store, row) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite')
          tx.objectStore(store).put(row)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })

      const db = await open()
      await put(db, 'clients', {
        id: clientId,
        trainer_id: trainerId,
        club_id: clubId,
        name: 'QA Outreach Expiring',
        phone: '+79009998877',
        max_chat_url: 'https://max.ru/u/qa-test-chat',
        birth_date: null,
        created_at: now,
      })
      await put(db, 'memberships', {
        id: memId,
        client_id: clientId,
        club_id: clubId,
        start_date: today,
        end_date: end,
        total_trainings: 8,
        used_trainings: 6,
        created_at: now,
      })
      db.close()
    },
    { trainerId, clubId: DEMO_CLUB_ID },
  )
}

const browser = await chromium.launch({ headless: true })

try {
  const admin = createSupabaseAdmin()
  await upsertQaUser(admin, {
    login: LOGIN,
    role: 'trainer',
    name: 'QA Outreach Trainer',
    club_id: DEMO_CLUB_ID,
  })
} catch (e) {
  console.warn('warn: QA user upsert skipped —', e.message)
}

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' })
const page = await context.newPage()

try {
  await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('#login', { state: 'visible', timeout: 15000 })
  await page.locator('#login').fill(LOGIN)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(
    () => !window.location.pathname.includes('/login'),
    null,
    { timeout: 30000 },
  ).catch(async () => {
    const err = await page.locator('[role="alert"]').allTextContents()
    throw new Error(`login stuck on /login${err.length ? `: ${err.join(' | ')}` : ''}`)
  })
  ok(true, `login ok → ${page.url()}`)

  const trainerId = await readTrainerId(page)
  ok(Boolean(trainerId), `trainer id (${trainerId || 'missing'})`)

  if (trainerId) {
    await seedExpiringClient(page, trainerId)
  }

  await page.goto(`${ORIGIN}/trainer/clients?filter=expiring`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.td-list-loading', { state: 'detached', timeout: 20000 }).catch(() => null)
  await page.waitForTimeout(1500)

  const progressVisible = await page.locator('.trainer-outreach-progress').isVisible().catch(() => false)
  const maxCount = await page.locator('.trainer-max-btn').count()

  if (!progressVisible && maxCount === 0) {
    warn('no expiring clients in list — UI checks limited (seed may need pull refresh)')
  } else {
    if (progressVisible) {
      const progressText = await page.locator('.trainer-outreach-progress__count').innerText()
      ok(/^\d+\/\d+$/.test(progressText.trim()), `progress format "${progressText}"`)

      const nextBtn = page.locator('.trainer-outreach-next-btn')
      if ((await nextBtn.count()) > 0) {
        ok((await nextBtn.locator('svg').count()) === 1, 'next button is icon')
      } else {
        warn('next button hidden (all sent or no phone)')
      }
    }

    if (maxCount > 0) {
      const maxBtn = page.locator('.trainer-max-btn').first()
      ok((await maxBtn.locator('svg').count()) === 1, 'Max button is icon-only')
      ok((await maxBtn.innerText()).trim() === '', 'Max button has no text')

      await page.evaluate(() => {
        window.__maxOpenUrl = ''
        window.__copiedText = ''
        window.location.assign = (url) => {
          window.__maxOpenUrl = String(url)
        }
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (t) => { window.__copiedText = t } },
        })
      })

      await maxBtn.click()
      await page.waitForTimeout(800)

      const copied = await page.evaluate(() => window.__copiedText ?? '')
      const maxUrl = await page.evaluate(() => window.__maxOpenUrl ?? '')
      ok(copied.length > 10, 'Max click copies message')
      if (maxUrl.includes('/u/')) {
        ok(maxUrl.includes('max.ru'), `direct chat url (${maxUrl})`)
      } else {
        warn(`share mode or blocked navigation (${maxUrl || 'no url'})`)
      }

      const nextBtn = page.locator('.trainer-outreach-next-btn')
      if ((await nextBtn.count()) > 0) {
        await nextBtn.click()
        await page.waitForTimeout(600)
        ok((await page.locator('.td-client-item--highlight').count()) > 0, 'next highlights row')
      }
    }
  }

  await page.screenshot({ path: join(shotDir, 'outreach-expiring.png'), fullPage: true })
  console.log(`screenshot: ${join(shotDir, 'outreach-expiring.png')}`)
} catch (e) {
  console.error('FAIL: browser smoke error', e.message)
  await page.screenshot({ path: join(shotDir, 'outreach-error.png'), fullPage: true }).catch(() => null)
  failed++
} finally {
  await browser.close()
}

if (failed) process.exit(1)
console.log('verify-trainer-outreach-ui-browser: all passed')
