/**
 * Обвязка автотестов экрана: Vite dev на 127.0.0.1, Chromium, перехват облака.
 * Ни один запрос не уходит наружу: облачные пути отвечает fakeBackend, смайлики Noto — с vite из
 * public/chat-emoji/ (зеркало); чужие хосты — abort.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { VIDEO_OPS_CLIENT, VIDEO_OPS_COACH, VIDEO_OPS_STAFF, videoSendBody } from '../../../api/_lib/chat/chatVideoHandler.js'

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
export const PORT = Number(process.env.E2E_PORT || 5199)
export const ORIGIN = `http://127.0.0.1:${PORT}`
export const SHOT_DIR = join(ROOT, 'qa-screenshots', 'e2e')

const CLOUD_PATH = /^\/(api|auth\/v1|rest\/v1)(\/|$)/
/** Видеокружок приходит байтами — тело отправки собираем, как сервер (chatVideoHandler). */
const VIDEO_OPS = { '/api/client-me': VIDEO_OPS_CLIENT, '/api/coach': VIDEO_OPS_COACH, '/api/admin-data': VIDEO_OPS_STAFF }

const ENV = {
  VITE_SUPABASE_URL: ORIGIN,
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.e2e',
  /* Прокси dev-сервера на прод — в никуда: страховка, если перехват что-то пропустит. */
  VITE_DEV_API_PROXY: 'http://127.0.0.1:9',
  VITE_ADMIN_EMAILS: '',
}

async function waitForHttp(url, timeoutMs) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Vite не поднялся за ${timeoutMs} мс: ${url}`)
}

export async function startDevServer() {
  const child = spawn(
    process.execPath,
    [join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, env: { ...process.env, ...ENV }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let out = ''
  child.stdout.on('data', (d) => (out += d))
  child.stderr.on('data', (d) => (out += d))
  try {
    await waitForHttp(`${ORIGIN}/`, 60_000)
  } catch (e) {
    child.kill()
    throw new Error(`${e.message}\n${out}`)
  }
  return { stop: () => child.kill() }
}

/** Управляемый navigator.onLine: тест «выключает интернет», не ломая загрузку модулей с dev-сервера. */
const ONLINE_SHIM = `
  Object.defineProperty(Navigator.prototype, 'onLine', {
    configurable: true,
    get() { return window.__e2eOnline !== false },
  })
`

/**
 * @param {import('playwright').Browser} browser
 * @param {ReturnType<import('./fakeBackend.mjs').createFakeBackend>} backend
 */
export async function newE2eContext(browser, backend, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    ...opts,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    serviceWorkers: 'block',
  })
  await context.addInitScript(ONLINE_SHIM)
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.origin !== ORIGIN) return route.abort('blockedbyclient')
    if (!CLOUD_PATH.test(url.pathname)) return route.continue()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    let body = null
    const isVideo = String(req.headers()['content-type'] ?? '').startsWith('video/')
    const raw = isVideo ? null : req.postData()
    if (isVideo) {
      body = videoSendBody({ body: req.postDataBuffer(), query: Object.fromEntries(url.searchParams) }, VIDEO_OPS[url.pathname] ?? [])
    } else if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw))
      }
    }
    const res = await backend.handle({
      method: req.method(),
      path: url.pathname,
      searchParams: url.searchParams,
      headers: req.headers(),
      body,
    })
    if (!res) return route.abort('internetdisconnected')
    if (res.file) return route.fulfill({ status: res.status, contentType: res.contentType, body: res.file })
    return route.fulfill({
      status: res.status,
      contentType: 'application/json',
      headers: res.headers,
      body: res.json === undefined ? '' : JSON.stringify(res.json),
    })
  })
  return context
}

/** «Интернет пропал / вернулся» на всех вкладках контекста. */
export async function setCloudOnline(context, backend, online) {
  backend.cloudDown = !online
  for (const page of context.pages()) {
    await page.evaluate((on) => {
      globalThis.__e2eOnline = on
      globalThis.dispatchEvent(new Event(on ? 'online' : 'offline'))
    }, online)
  }
}

export async function launchBrowser() {
  return chromium.launch({ headless: process.env.E2E_HEADED !== '1' })
}

export async function screenshot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true })
  const path = join(SHOT_DIR, `${name}.png`)
  await page.screenshot({ path, fullPage: false, animations: 'disabled' })
  return path
}

/** Поле ввода диалога прижато к нижнему краю экрана (не висит посередине при паре сообщений). */
export async function chatComposeAtBottom(page) {
  const box = await page.locator('.chat-compose').boundingBox()
  const height = page.viewportSize()?.height ?? 0
  return Boolean(box) && Math.abs(box.y + box.height - height) <= 2
}

export async function loginUi(page, login, password) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded' })
  const splash = page.locator('.app-welcome-shell')
  if (await splash.isVisible().catch(() => false)) {
    await splash.waitFor({ state: 'hidden', timeout: 15_000 })
  }
  await page.locator('#login').fill(login)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

/**
 * Телефон тренера: логин и пароль спрятаны под «Войти логином и паролем».
 * Если поле уже открыто (кнопку нажали в сценарии), второй раз её не жмём.
 */
export async function fillCoachCredentials(page, login, password) {
  const field = page.getByLabel('Логин')
  const toggle = page.getByRole('button', { name: 'Войти логином и паролем' })
  await field.or(toggle).first().waitFor({ state: 'visible', timeout: 15_000 })
  if (!(await field.isVisible().catch(() => false))) {
    await toggle.click()
    await field.waitFor({ state: 'visible', timeout: 10_000 })
  }
  await field.fill(login)
  await page.getByLabel('Пароль').fill(password)
}
