/**
 * Клиент АЗ / смесь — DEV-превью всей фичи этапов 2–5 (прод /me ещё только ПЗ).
 * Сценарий: чистый АЗ (главная → тренировки → сообщения) и смесь ПЗ+АЗ на главной.
 * Плюс эргономика телефона: 2 плитки в ряд, вкладки ≥44px, без горизонтального скролла.
 *
 * Ручной чеклист — docs/CLIENT_APP.md § «Сценарий проверки АЗ в /me (DEV)».
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'

export const name = 'клиент АЗ: превью главной, тренировок и сообщений'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}

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

async function tabLabels(page) {
  return page.locator('.coach-tabs__tab').allTextContents()
}

async function phoneErgonomics(page) {
  return page.evaluate(() => {
    const d = globalThis.document
    const tabs = [...d.querySelectorAll('.coach-tabs__tab')].map((el) => {
      const r = el.getBoundingClientRect()
      return { label: (el.textContent || '').replace(/\s+/g, ' ').trim(), h: Math.round(r.height), w: Math.round(r.width) }
    })
    const tiles = d.querySelector('.client-me-tiles')
    let tilesTwoCols = null
    if (tiles) {
      const kids = [...tiles.children].filter((el) => el.getBoundingClientRect().height > 0)
      if (kids.length >= 2) {
        const a = kids[0].getBoundingClientRect()
        const b = kids[1].getBoundingClientRect()
        tilesTwoCols = Math.abs(a.top - b.top) < 8 && b.left > a.right - 2
      }
    }
    const doc = d.documentElement
    const overflowX = Math.ceil(doc.scrollWidth - doc.clientWidth)
    return { tabs, tilesTwoCols, overflowX, vw: globalThis.innerWidth }
  })
}

export async function run(browser) {
  const c = createChecks('client-az-me')
  const backend = createFakeBackend({ users: [], clubs: [], clients: [], memberships: [], trainings: [], health_cards: [] })
  const context = await newE2eContext(browser, backend, IPHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))

  try {
    /* ——— 1. Чистый АЗ: главная ——— */
    await page.goto(`${ORIGIN}/me/home-preview?az=1`)
    c.ok(await visible(page, 'Андреенко'), 'АЗ главная: имя клиента')
    c.ok(await visible(page, 'чистый АЗ'), 'АЗ главная: пометка превью')
    const memAz = page.locator('section', { has: page.getByRole('heading', { name: 'Мой абонемент' }) })
    c.ok(/АЗ\s*·\s*Бокс/.test(((await memAz.textContent()) || '').replace(/\s+/g, ' ')), 'АЗ главная: метка зала на абонементе')
    const nextAz = page.locator('section', { has: page.getByRole('heading', { name: 'Следующая тренировка' }) })
    c.ok(/Бокс\s*·\s*группа/.test(((await nextAz.textContent()) || '').replace(/\s+/g, ' ')), 'АЗ главная: «Следующая» = Бокс · группа')
    c.ok(!(await visible(page, 'Бонусы')), 'АЗ главная: блока «Бонусы» нет')
    const tabsAz = await tabLabels(page)
    c.ok(!tabsAz.some((t) => /От тренера/i.test(t)), 'АЗ: вкладки без «От тренера»')
    c.ok(tabsAz.some((t) => /Главная/i.test(t)) && tabsAz.some((t) => /Тренировки/i.test(t)) && tabsAz.some((t) => /Сообщения/i.test(t)), 'АЗ: три вкладки — Главная · Тренировки · Сообщения')
    c.ok(await visible(page, 'Мои тренировки'), 'АЗ главная: карточка «Мои тренировки» с фактом визитов')
    await screenshot(page, 'client-az-home')

    const ergoAz = await phoneErgonomics(page)
    c.ok(ergoAz.tilesTwoCols === true, 'эргономика АЗ: две плитки в один ряд на 390px')
    c.ok(
      ergoAz.tabs.length >= 3 && ergoAz.tabs.every((t) => t.h >= 44 && t.w >= 44),
      `эргономика АЗ: вкладки ≥44px (сейчас ${ergoAz.tabs.map((t) => `${t.label}:${t.w}×${t.h}`).join(', ')})`,
    )
    c.ok(ergoAz.overflowX <= 1, `эргономика АЗ: нет горизонтального скролла (лишних ${ergoAz.overflowX}px)`)

    /* ——— 2. Смесь ПЗ+АЗ: главная ——— */
    await page.goto(`${ORIGIN}/me/home-preview?mixed=1`)
    c.ok(await visible(page, 'ПЗ+АЗ'), 'смесь: пометка превью')
    const memMix = page.locator('section', { has: page.getByRole('heading', { name: 'Мой абонемент' }) })
    const memMixText = ((await memMix.textContent()) || '').replace(/\s+/g, ' ')
    c.ok(/АЗ\s*·\s*Бокс/.test(memMixText), 'смесь: на плитке срочный АЗ (меньше дней), метка зала')
    c.ok(await visible(page, 'Остальные абонементы'), 'смесь: подпись — остальные во «Тренировках»')
    c.ok(await visible(page, 'Бонусы'), 'смесь с открытым ПЗ: блок «Бонусы» есть')
    const tabsMix = await tabLabels(page)
    c.ok(tabsMix.some((t) => /От тренера/i.test(t)), 'смесь: вкладка «От тренера» есть')
    await screenshot(page, 'client-az-home-mixed')

    /* ——— 3. Тренировки: чистый АЗ ——— */
    await page.goto(`${ORIGIN}/me/trainings-preview?az=1`)
    c.ok(await visible(page, 'списания у стойки'), 'тренировки АЗ: пометка превью')
    c.ok(await visible(page, 'АЗ · Бокс'), 'тренировки АЗ: карточка направления')
    c.ok(await visible(page, 'у стойки'), 'тренировки АЗ: подпись «у стойки»')
    const openBtns = await page.locator('.client-trainings__open').count()
    c.ok(openBtns === 0, 'тренировки АЗ: нет кнопки открыть окно подходов')
    await screenshot(page, 'client-az-trainings')

    /* ——— 4. Тренировки: смесь ——— */
    await page.goto(`${ORIGIN}/me/trainings-preview?mixed=1`)
    c.ok(await visible(page, 'ПЗ + два АЗ'), 'тренировки смесь: пометка')
    c.ok(await visible(page, 'без списания занятий'), 'тренировки смесь: ТЗ — только срок')
    c.ok(await visible(page, 'журнала визитов'), 'тренировки смесь: подсказка ТЗ без журнала')
    await screenshot(page, 'client-az-trainings-mixed')

    /* ——— 5. Сообщения: чистый АЗ ——— */
    await page.goto(`${ORIGIN}/me/inbox-preview?az=1`)
    c.ok(await visible(page, 'чистый АЗ'), 'сообщения АЗ: пометка')
    c.ok(await visible(page, 'Бокс'), 'сообщения АЗ: диалог инструктора Бокс')
    c.ok(await visible(page, 'Степ'), 'сообщения АЗ: диалог инструктора Степ')
    c.ok(await visible(page, 'Менеджер по продажам'), 'сообщения АЗ: менеджер на месте')
    const tabsInbox = await tabLabels(page)
    c.ok(!tabsInbox.some((t) => /От тренера/i.test(t)), 'сообщения АЗ: без вкладки «От тренера»')
    c.ok((await page.getByText(/^Тренер/).count()) === 0, 'сообщения АЗ: нет диалога «Тренер»')
    await screenshot(page, 'client-az-inbox')

    const ergoInbox = await phoneErgonomics(page)
    c.ok(ergoInbox.overflowX <= 1, `эргономика сообщений АЗ: без горизонтального скролла (${ergoInbox.overflowX}px)`)
    c.ok(
      ergoInbox.tabs.every((t) => t.h >= 44),
      `эргономика сообщений: высота вкладок ≥44px (${ergoInbox.tabs.map((t) => t.h).join('/')})`,
    )

    c.ok(pageErrors.length === 0, `без ошибок JS (${pageErrors.slice(0, 2).join('; ') || 'нет'})`)
  } catch (e) {
    await screenshot(page, 'client-az-me-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
