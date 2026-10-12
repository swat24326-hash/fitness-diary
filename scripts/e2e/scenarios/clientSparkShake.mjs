/**
 * /me на телефоне: потряс — по графику веса бежит волна (линия гнётся вместе с точками) и затихает.
 * Подсказка «Потрясите телефон» пропадает после первой тряски; толчок — не тряска; при «уменьшении движения» датчик не слушаем.
 * Датчик — синтетические devicemotion: данные пришли — путь Android, без нажатия кнопки.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, isoDay, weightHistorySeed } from '../lib/fixtures.mjs'

export const name = 'клиент /me: потряс — график веса оживает'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  hasTouch: true,
  isMobile: true,
}
const INVITE = 'e2e-shake-invite'
const SHAKE = [[12, 0], [-12, 0], [12, 0], [-12, 0], [12, 0]]
const BUMP = [[20, 0], [0, 0]]
const LINE = '.client-me-spark__line'

/** Замеры датчика с шагом 110 мс: [x, y], z — сила тяжести. */
function motion(page, samples) {
  return page.evaluate(async (list) => {
    for (const [x, y] of list) {
      globalThis.dispatchEvent(new globalThis.DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x, y, z: 9.8 } }))
      await new Promise((r) => setTimeout(r, 110))
    }
  }, samples)
}

/** Считаем волны: сколько раз график входил в состояние --wave. */
function watchWaves(page) {
  return page.locator('.client-me-spark').evaluate((el) => {
    globalThis.__waves = 0
    let on = el.classList.contains('client-me-spark--wave')
    new globalThis.MutationObserver(() => {
      const now = el.classList.contains('client-me-spark--wave')
      if (now && !on) globalThis.__waves += 1
      on = now
    }).observe(el, { attributes: true, attributeFilter: ['class'] })
  })
}
const waves = (page) => page.evaluate(() => globalThis.__waves)

function wireBackend() {
  const backend = createFakeBackend(weightHistorySeed())
  backend.clientMe = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: INVITE, today: isoDay(0) })
  return backend
}

async function openHome(page) {
  await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
  await page.waitForURL(`${ORIGIN}/me`, { timeout: 15_000 })
  const spark = page.locator('.client-me-spark')
  await spark.waitFor({ timeout: 10_000 })
  await spark.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1300)
  await watchWaves(page)
  return spark
}

/** iPhone: датчик молчит до разрешения; кнопка спрашивает его. answer — что ответил человек. */
async function iphone(c, browser, answer) {
  const context = await newE2eContext(browser, wireBackend(), PHONE)
  await context.addInitScript((a) => {
    globalThis.DeviceMotionEvent.requestPermission = async () => a
  }, answer)
  const page = await context.newPage()
  try {
    await openHome(page)
    const hint = page.getByRole('button', { name: 'Потрясите телефон' })
    await hint.click()
    await page.waitForTimeout(150)
    if (answer === 'granted') c.ok((await waves(page)) === 1, 'iPhone: разрешил — по графику сразу пошла волна')
    else c.ok((await waves(page)) === 0, 'iPhone: отказал — график спокоен')
    c.ok(await hint.isHidden(), `iPhone: ${answer === 'granted' ? 'разрешил' : 'отказал'} — подсказка больше не показывается`)
  } catch (e) {
    await screenshot(page, `client-spark-shake-ios-${answer}-FAIL`).catch(() => null)
    c.ok(false, `iPhone (${answer}): сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('client-spark-shake')
  await iphone(c, browser, 'granted')
  await iphone(c, browser, 'denied')
  const context = await newE2eContext(browser, wireBackend(), PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    const spark = await openHome(page)
    const hint = page.getByRole('button', { name: 'Потрясите телефон' })
    c.ok(await hint.isVisible(), 'под графиком подсказка «Потрясите телефон»')
    const rest = await page.locator(LINE).getAttribute('d')

    await motion(page, BUMP)
    await page.waitForTimeout(200)
    c.ok((await waves(page)) === 0, 'один толчок — график спокоен')

    await motion(page, SHAKE)
    c.ok((await waves(page)) === 1, 'потряс — по графику пошла волна')
    c.ok((await page.locator(LINE).getAttribute('d')) !== rest, 'линия гнётся вместе с точками')
    await screenshot(page, 'client-spark-shake')
    c.ok(await hint.isHidden(), 'после первой тряски подсказка пропала')

    await motion(page, SHAKE)
    c.ok((await waves(page)) === 1, 'сразу снова — ждём, пока волна затихнет')
    await page.waitForTimeout(1500)
    c.ok(!(await spark.evaluate((el) => el.classList.contains('client-me-spark--wave'))), 'волна затихла')
    c.ok((await page.locator(LINE).getAttribute('d')) === rest, 'линия вернулась ровно на место')
    await page.waitForTimeout(600)
    await motion(page, SHAKE)
    c.ok((await waves(page)) === 2, 'после паузы — новая волна')

    await page.reload()
    await spark.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(500)
    c.ok(await hint.isHidden(), 'после перезагрузки подсказки нет — уже тряс')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await spark.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(500)
    await watchWaves(page)
    await motion(page, SHAKE)
    c.ok((await waves(page)) === 0, '«уменьшение движения» в телефоне — тряска выключена')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'client-spark-shake-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
