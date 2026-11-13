/**
 * /me на iPhone: ряд сторис → открыть → кадр показан → реакция → закрыть.
 * Ловит склейку UI (пустой rail / «Загружаем…» навечно / viewer не закрывается).
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { seedClientStories } from '../lib/fakeClientStories.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLUB_ID, TRAINER_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'

export const name = 'клиент /me: сторис — открыть, реакция, закрыть'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const INVITE = 'e2e-stories-invite'
const AUTHOR = 'Тренер Тестов'

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

export async function run(browser) {
  const c = createChecks('client-stories-me')
  const backend = createFakeBackend(completedTodaySeed())
  seedClientStories(backend.state, {
    clubId: CLUB_ID,
    authorId: TRAINER_ID,
    authorName: AUTHOR,
  })
  backend.clientMe = createFakeClientPortal(backend.state, {
    clientId: CLIENT_ID,
    inviteToken: INVITE,
    today: isoDay(0),
  })
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })

    const install = page.getByRole('region', { name: 'Значок на экран «Домой»' })
    if (await install.isVisible().catch(() => false)) {
      await install.getByRole('button', { name: 'Готово' }).click()
      await install.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
    }

    const ring = page.getByRole('button', { name: `${AUTHOR}, есть новое` })
    c.ok(await ring.waitFor({ timeout: 10_000 }).then(() => true, () => false), 'на главной — кружок сторис с новым')

    const rail = page.locator('.stories-rail--pull').first()
    c.ok(await rail.waitFor({ timeout: 5_000 }).then(() => true, () => false), 'ряд в режиме компакт/pull (телефон)')
    await page.evaluate(() => {
      const el = globalThis.document.querySelector('.client-me')
      if (el) el.scrollTop = 0
    })
    const compactW = await page.locator('.stories-rail__circle').first().evaluate((el) => el.getBoundingClientRect().width)
    const box = await rail.boundingBox()
    const from = { x: box.x + 36, y: box.y + 20 }
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
    for (let i = 1; i <= 12; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x, y: from.y + i * 8 }],
      })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(200)
    const expanded = await rail.evaluate((el) => el.classList.contains('is-expanded'))
    const bigW = await page.locator('.stories-rail__circle').first().evaluate((el) => el.getBoundingClientRect().width)
    c.ok(expanded, 'потянуть вниз по ряду — is-expanded')
    c.ok(bigW > compactW + 8, `кружок вырос ${Math.round(compactW)} → ${Math.round(bigW)}`)
    await screenshot(page, 'client-stories-rail')

    await ring.click()

    const dialog = page.getByRole('dialog', { name: AUTHOR })
    c.ok(await dialog.waitFor({ timeout: 10_000 }).then(() => true, () => false), 'открылся просмотр сторис')
    c.ok(await visible(page, 'E2E кадр'), 'подпись кадра видна')

    const img = dialog.locator('img.stories-view__frame').first()
    c.ok(
      await img.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false),
      'кадр загрузился (не вечный «Загружаем…»)',
    )
    // Без долгого waitFor: иначе фото (5 с) само закроет просмотр до реакции
    c.ok(!(await page.getByText('Загружаем…').isVisible().catch(() => false)), 'статус «Загружаем…» ушёл')
    await screenshot(page, 'client-stories-open')

    // Удержание паузит полоску — успеваем нажать реакцию
    await dialog.locator('.stories-view__phone').dispatchEvent('pointerdown', { buttons: 1 })
    const heart = dialog.getByRole('group', { name: 'Реакция на сторис' }).getByRole('button').nth(1)
    await heart.click({ force: true })
    c.ok(
      await heart
        .evaluate((el) => el.getAttribute('aria-pressed') === 'true')
        .catch(() => false),
      'реакция ❤️ поставилась',
    )
    const reacted = (backend.state.club_story_views ?? []).some((v) => v.reaction === '❤️')
    c.ok(reacted, 'реакция ушла на сервер (fake)')

    await dialog.locator('.stories-view__phone').dispatchEvent('pointerup', { buttons: 0 })
    await dialog.getByRole('button', { name: 'Закрыть' }).click()
    c.ok(
      await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true, () => false),
      'просмотр закрылся',
    )

    const seenRing = page.getByRole('button', { name: AUTHOR, exact: true })
    c.ok(
      await seenRing.waitFor({ timeout: 5_000 }).then(() => true, () => false),
      'после просмотра кружок без «есть новое»',
    )

    // На короткой главной контент может влезать в экран — удлиняем, чтобы поймать «залипший» скролл
    const scroll = await page.evaluate(() => {
      const doc = globalThis.document
      const el = doc.querySelector('.client-me.client-me--tabs') || doc.querySelector('.client-me')
      const main = doc.querySelector('.client-me__main')
      if (!el || !main) return { after: -1 }
      main.style.minHeight = `${el.clientHeight + 400}px`
      el.scrollTop = 180
      return { after: el.scrollTop }
    })
    c.ok(scroll.after >= 80, `после закрытия сторис страница листается (top=${scroll.after})`)

    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'client-stories-me-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
