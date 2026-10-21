/**
 * «Клиенты» на телефоне тренера: только свои активные (без чужого и закрытого ПЗ), цифра чипа = длина списка,
 * «Истекает» и поиск, «Позвонить» — tel:, шторка со всеми абонементами, «Написать» открывает диалог.
 */
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeChat } from '../lib/fakeChat.mjs'
import { createFakeCoach } from '../lib/fakeCoach.mjs'
import { ORIGIN, fillCoachCredentials, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, CLIENT_NAME, CLUB_ID, TRAINER_ID, TRAINER_LOGIN, TRAINER_PASSWORD, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'

export const name = 'телефон тренера: Клиенты с абонементами'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}
const BORIS = 'e2e-client-boris'
const VERA = 'e2e-client-vera'
const CHIPS = ['Все', 'ПНК', 'Истекает', 'Закончился', 'Давно', 'Не активные']

function setup() {
  const backend = createFakeBackend(trainerClubSeed())
  const chat = createFakeChat(backend.state)
  const own = (id, name, extra = {}) => ({ id, name, trainer_id: TRAINER_ID, club_id: CLUB_ID, phone: '', birth_date: null, ...extra })
  backend.state.clients[0].phone = '+7 999 111-22-33'
  backend.state.clients[0].card_number = '5870'
  backend.state.clients.push(
    own(BORIS, 'Борис Продлеваев', { card_number: '3334' }),
    own(VERA, 'Вера Новая', { lifecycle: 'pnk' }),
    own('e2e-client-closed', 'Закрытый ПЗ'),
    { ...own('e2e-client-alien', 'Чужой Клиент'), trainer_id: 'e2e-other-trainer' },
  )
  const mem = (id, clientId, start, end, total, used) => ({
    id, client_id: clientId, start_date: isoDay(start), end_date: isoDay(end), total_trainings: total, used_trainings: used, membership_type_id: 'e2e-type',
  })
  const clientsData = {
    memberships: [
      mem('e2e-m-anna', CLIENT_ID, -20, 3, 10, 3),
      mem('e2e-m-anna-old', CLIENT_ID, -80, -21, 8, 8),
      mem('e2e-m-boris', BORIS, -60, -5, 10, 6),
      mem('e2e-m-alien', 'e2e-client-alien', -10, 30, 10, 0),
    ],
    lifecycleRows: [{ client_id: 'e2e-client-closed', hall: 'pz', closed_at: new Date().toISOString() }],
    trainings: [{ client_id: CLIENT_ID, date: isoDay(-2), status: 'completed' }],
    typeCodeById: { 'e2e-type': 'ПЗ 10' },
  }
  const coach = createFakeCoach(backend.state, chat, { trainerId: TRAINER_ID, today: isoDay(0), schedule: [], clientsData })
  backend.coach = coach.handle
  return { backend, coach }
}

export async function run(browser) {
  const c = createChecks('coach-clients')
  const { backend } = setup()
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  const rows = page.locator('.coach-client')
  const chip = (label) => page.getByRole('button', { name: new RegExp(`^${label}: \\d+$`) })
  try {
    await page.goto(`${ORIGIN}/coach`)
    await fillCoachCredentials(page, TRAINER_LOGIN, TRAINER_PASSWORD)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await page.getByRole('link', { name: 'Клиенты', exact: true }).click()
    await rows.first().waitFor({ timeout: 15_000 })
    await screenshot(page, 'coach-clients-list')
    const noSideScroll = await page.evaluate(() => globalThis.document.scrollingElement.scrollWidth <= globalThis.innerWidth + 1)
    c.ok(noSideScroll, 'страница не листается вбок')
    const chipsFit = await page.evaluate(() =>
      [...globalThis.document.querySelectorAll('.trainer-clients-chip')].every((el) => {
        const r = el.getBoundingClientRect()
        const label = el.querySelector('.trainer-clients-chip__label')
        return r.left >= 0 && r.right <= globalThis.innerWidth && label.scrollWidth <= label.clientWidth
      }),
    )
    c.ok(chipsFit, 'все 7 чипов видны целиком, надписи не обрезаны')
    const chipRows = await page.evaluate(
      () => new Set([...globalThis.document.querySelectorAll('.trainer-clients-chip')].map((el) => Math.round(el.getBoundingClientRect().top))).size,
    )
    c.ok(chipRows === 2, `чипы в две строки (строк: ${chipRows})`)

    const names = await page.locator('.coach-client__name').allInnerTexts()
    c.ok(names.length === 3, `свои активные — 3 строки (видно: ${names.join(', ')})`)
    c.ok(!names.some((n) => /Чужой|Закрытый/.test(n)), 'чужой клиент и закрытый ПЗ не видны')
    const anna = rows.filter({ hasText: CLIENT_NAME })
    c.ok(/до .* · 3\/10/.test(await anna.innerText()), 'Анна: срок и 3/10 в строке')
    c.ok(/Карта 5870/.test(await anna.innerText()), 'Анна: номер карты')
    c.ok((await anna.getByRole('link', { name: /Позвонить/ }).getAttribute('href')) === 'tel:+79991112233', '«Позвонить» — tel: без пробелов')

    for (const label of CHIPS) {
      await chip(label).click()
      const want = Number((await chip(label).getAttribute('aria-label')).split(': ')[1])
      const got = await rows.count()
      c.ok(want === got, `чип «${label}»: цифра ${want} = строк ${got}`)
      if (label !== 'Все') await chip(label).click()
    }
    await chip('Истекает').click()
    c.ok((await page.locator('.coach-client__name').allInnerTexts()).join() === CLIENT_NAME, '«Истекает» — Анна')
    await screenshot(page, 'coach-clients-expiring')
    await chip('Истекает').click()

    await page.getByLabel('Поиск клиента').fill('3334')
    c.ok((await page.locator('.coach-client__name').allInnerTexts()).join() === 'Борис Продлеваев', 'поиск по карте')
    await page.getByLabel('Поиск клиента').fill('')

    await anna.getByRole('button', { name: /абонементы/ }).click()
    const sheet = page.getByRole('dialog', { name: `Абонементы: ${CLIENT_NAME}` })
    await sheet.waitFor({ timeout: 5_000 })
    const mems = await sheet.locator('.coach-mem').allInnerTexts()
    c.ok(mems.length === 2 && /ПЗ 10/.test(mems[0]) && /Идёт/.test(mems[0]), 'шторка: текущий абонемент сверху')
    c.ok(/Закончился/.test(mems[1] ?? ''), 'шторка: прошлый абонемент')
    await screenshot(page, 'coach-clients-sheet')
    await sheet.getByRole('link', { name: 'Написать' }).click()
    await page.waitForURL(`${ORIGIN}/coach/chat/${CLIENT_ID}`, { timeout: 10_000 })
    c.ok(true, '«Написать» открывает диалог с клиентом')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'coach-clients-FAIL').catch(() => null)
    c.ok(false, `Клиенты на телефоне: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
