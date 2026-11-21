/**
 * Дневник калорий со всех ролей:
 * превью ПЗ/АЗ → клиент ПЗ → клиент АЗ → тренер /trainer/nutrition → админ (клубы).
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { createFakeFoodDiaryAdmin } from '../lib/fakeFoodDiary.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, CLIENT_ID, CLIENT_NAME, TRAINER_ID, isoDay, trainerClubSeed } from '../lib/fixtures.mjs'
import { openTrainerSession } from '../lib/trainerSteps.mjs'

export const name = 'дневник калорий: ПЗ, АЗ, тренер, админ'

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
}

const AZ_ID = 'e2e00000-0000-4000-8000-0000000000b2'
const EMPTY_ID = 'e2e00000-0000-4000-8000-0000000000b3'
const AZ_INVITE = 'e2e-food-az-invite'
const PZ_INVITE = 'e2e-food-pz-invite'
const PLAN_ID = 'e2e00000-0000-4000-8000-0000000000n1'
const EMPTY_NAME = 'Пустова Ольга'
const ADMIN = { id: 'e2e00000-0000-4000-8000-0000000000ad', login: 'e2e_admin_food', password: randomUUID() }

function reaches(locator) {
  return locator
    .first()
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
}

function jwtSub(authorization) {
  try {
    const token = String(authorization ?? '').replace(/^Bearer\s+/i, '')
    const mid = token.split('.')[1]
    if (!mid) return ''
    const json = Buffer.from(mid.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return String(JSON.parse(json)?.sub ?? '')
  } catch {
    return ''
  }
}

function buildSeed(today) {
  const seed = trainerClubSeed()
  seed.clubs[0].food_diary_enabled = true
  seed.clients.push(
    {
      id: AZ_ID,
      trainer_id: null,
      club_id: CLUB_ID,
      name: 'Азова Мария',
      phone: '+7 900 000-00-02',
      birth_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: EMPTY_ID,
      trainer_id: TRAINER_ID,
      club_id: CLUB_ID,
      name: EMPTY_NAME,
      phone: '+7 900 000-00-03',
      birth_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  )
  seed.client_plans = [
    {
      id: PLAN_ID,
      client_id: CLIENT_ID,
      club_id: CLUB_ID,
      kind: 'nutrition',
      payload: {
        kcal_target: 1900,
        totals: { kcal: 1900, proteinG: 120, fatG: 60, carbsG: 180 },
        meals: [
          {
            label: 'Завтрак',
            items: [{ label: 'Творог', grams: 150, kcal: 170, proteinG: 27, fatG: 5, carbsG: 5 }],
          },
        ],
      },
      sent_at: `${today}T10:00:00.000Z`,
      sent_by: TRAINER_ID,
      client_seen_at: null,
    },
  ]
  seed.client_food_diary_entries = [
    {
      id: randomUUID(),
      client_id: CLIENT_ID,
      club_id: CLUB_ID,
      entry_date: today,
      meal_key: 'breakfast',
      name: 'Творог',
      grams: 150,
      kcal: 170,
      protein_g: 27,
      fat_g: 5,
      carbs_g: 5,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
    },
  ]
  seed.users.push({
    id: ADMIN.id,
    login: ADMIN.login,
    email: `${ADMIN.login}@admin.local`,
    password: ADMIN.password,
    role: 'admin',
    name: 'Админ Еда',
    club_id: null,
    is_active: true,
  })
  return seed
}

function wireClientMe(backend, today) {
  const pz = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: PZ_INVITE, today })
  const az = createFakeClientPortal(backend.state, { clientId: AZ_ID, inviteToken: AZ_INVITE, today })
  backend.clientMe = (req) => {
    const token = req.body?.token
    if (req.body?.action === 'redeem' && token === AZ_INVITE) return az(req)
    if (req.body?.action === 'redeem' && token === PZ_INVITE) return pz(req)
    const sub = jwtSub(req.headers?.authorization)
    if (sub === AZ_ID) return az(req)
    return pz(req)
  }
  backend.adminData = createFakeFoodDiaryAdmin(backend.state, { today })
}

export async function run(browser) {
  const c = createChecks('food-diary-roles')
  const today = isoDay(0)
  const seed = buildSeed(today)
  const backend = createFakeBackend(seed)
  wireClientMe(backend, today)

  try {
    /* ——— Превью ПЗ ——— */
    {
      const context = await newE2eContext(browser, backend, IPHONE)
      const page = await context.newPage()
      try {
        await page.goto(`${ORIGIN}/me/food-diary-preview`)
        c.ok(await reaches(page.getByRole('tab', { name: 'Рацион' })), 'превью ПЗ: вкладка Рацион')
        c.ok(await reaches(page.getByRole('tab', { name: 'Ещё' })), 'превью ПЗ: вкладка Ещё')
        await page.getByRole('tab', { name: 'Ещё' }).click()
        c.ok(await reaches(page.getByRole('heading', { name: 'Мои цели' })), 'превью ПЗ: Мои цели')
        await screenshot(page, 'food-diary-preview-pz')
      } finally {
        await context.close()
      }
    }

    /* ——— Превью АЗ/ТЗ ——— */
    {
      const context = await newE2eContext(browser, backend, IPHONE)
      const page = await context.newPage()
      try {
        await page.goto(`${ORIGIN}/me/food-diary-preview?az=1`)
        c.ok(await reaches(page.getByRole('tab', { name: 'День' })), 'превью АЗ/ТЗ: вкладка День')
        c.ok(!(await reaches(page.getByRole('tab', { name: 'Рацион' }))), 'превью АЗ/ТЗ: без Рациона')
        await page.getByRole('tab', { name: 'Ещё' }).click()
        c.ok(await reaches(page.getByText(/сами задаёте ориентир/i)), 'превью АЗ: подсказка своих целей')
        await screenshot(page, 'food-diary-preview-az')
      } finally {
        await context.close()
      }
    }

    /* ——— Клиент ПЗ ——— */
    {
      const context = await newE2eContext(browser, backend, IPHONE)
      const page = await context.newPage()
      try {
        await page.goto(`${ORIGIN}/me/join#t=${PZ_INVITE}`)
        await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
        /* aria-label вкладки = «Дневник калорий»; плитка на главной тоже — берём низ */
        const foodTab = page.locator('.coach-tabs').getByRole('link', { name: 'Дневник калорий' })
        const fromTrainer = page.locator('.coach-tabs').getByText('От тренера', { exact: true })
        c.ok(await reaches(foodTab), 'ПЗ: вкладка Еда')
        c.ok(await reaches(fromTrainer), 'ПЗ: есть От тренера')
        await foodTab.click()
        await page.waitForURL(/\/me\/food-diary/, { timeout: 10_000 })
        c.ok(await reaches(page.getByRole('tab', { name: 'Рацион' })), 'ПЗ: в Еде есть Рацион')
        await page.getByRole('tab', { name: 'Рацион' }).click()
        c.ok(await reaches(page.getByRole('button', { name: 'В дневник' })), 'ПЗ: «В дневник»')
        await page.getByRole('tab', { name: 'Ещё' }).click()
        c.ok(await reaches(page.getByText(/цели из рациона тренера/i)), 'ПЗ: подсказка — цели из рациона')
        await page.locator('.coach-tabs').getByText('От тренера', { exact: true }).click()
        await page.waitForURL(`${ORIGIN}/me/task`, { timeout: 10_000 })
        c.ok(!(await reaches(page.getByRole('link', { name: 'Питание', exact: true }))), 'ПЗ: в От тренера нет Питания')
        await screenshot(page, 'food-diary-client-pz')
      } finally {
        await context.close()
      }
    }

    /* ——— Клиент АЗ ——— */
    {
      const context = await newE2eContext(browser, backend, IPHONE)
      const page = await context.newPage()
      try {
        await page.goto(`${ORIGIN}/me/join#t=${AZ_INVITE}`)
        await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
        const foodTab = page.locator('.coach-tabs').getByRole('link', { name: 'Дневник калорий' })
        c.ok(await reaches(foodTab), 'АЗ: вкладка Еда')
        const bottom = await page.locator('.coach-tabs__tab').allTextContents()
        c.ok(!bottom.some((t) => /От тренера/i.test(t)), 'АЗ: без От тренера')
        await foodTab.click()
        await page.waitForURL(/\/me\/food-diary/, { timeout: 10_000 })
        c.ok(!(await reaches(page.getByRole('tab', { name: 'Рацион' }))), 'АЗ: без Рациона')
        await page.getByRole('tab', { name: 'Ещё' }).click()
        await page.getByLabel('Ккал').fill('1750')
        await page.getByLabel('Белки, г').fill('110')
        await page.getByLabel('Жиры, г').fill('55')
        await page.getByLabel('Углеводы, г').fill('160')
        await page.getByRole('button', { name: 'Сохранить цели' }).click()
        c.ok(await reaches(page.getByText('Цели сохранены')), 'АЗ: цели сохранились')
        await page.getByRole('tab', { name: 'День' }).click()
        c.ok(await reaches(page.getByText(/\/ 1750 ккал/)), 'АЗ: на Дне цель 1750')
        await screenshot(page, 'food-diary-client-az')
      } finally {
        await context.close()
      }
    }

    /* ——— Тренер: отчёты питания (roster) ——— */
    {
      const session = await openTrainerSession(browser, seed)
      session.backend.adminData = createFakeFoodDiaryAdmin(session.backend.state, { today })
      try {
        await session.page.goto(`${ORIGIN}/trainer`, { waitUntil: 'domcontentloaded' })
        c.ok(await reaches(session.page.getByRole('link', { name: 'Питание' })), 'тренер: плитка Питание на главной')
        await session.page.getByRole('link', { name: 'Питание' }).click()
        await session.page.waitForURL(`${ORIGIN}/trainer/nutrition`, { timeout: 10_000 })
        c.ok(await reaches(session.page.getByRole('heading', { name: 'Питание' })), 'тренер: экран Питание')
        c.ok(await reaches(session.page.getByText(CLIENT_NAME)), 'тренер: ПЗ в списке')
        c.ok(await reaches(session.page.getByText(/170\s*\/\s*1900 ккал/)), 'тренер: факт/цель ккал у ПЗ')
        c.ok(await reaches(session.page.getByText('Ниже цели рациона')), 'тренер: статус «ниже цели»')
        c.ok(await reaches(session.page.getByText(EMPTY_NAME)), 'тренер: клиент без записей в списке')
        c.ok(!(await reaches(session.page.getByText('Азова Мария'))), 'тренер: чужой АЗ без trainer_id не в списке')

        await session.page.getByRole('tab', { name: 'Мимо' }).click()
        c.ok(await reaches(session.page.getByText(CLIENT_NAME)), 'тренер: фильтр Мимо — ПЗ')
        c.ok(!(await reaches(session.page.getByText(EMPTY_NAME))), 'тренер: фильтр Мимо — без пустого')

        await session.page.getByRole('tab', { name: 'Пусто' }).click()
        c.ok(await reaches(session.page.getByText(EMPTY_NAME)), 'тренер: фильтр Пусто — молчит')
        c.ok(!(await reaches(session.page.getByText(CLIENT_NAME))), 'тренер: фильтр Пусто — без ПЗ')

        await session.page.getByRole('tab', { name: 'В цели' }).click()
        c.ok(await reaches(session.page.getByText('Нет клиентов в этом фильтре')), 'тренер: фильтр В цели — пусто')

        await session.page.getByRole('tab', { name: 'Все' }).click()
        await session.page.locator('.food-diary-roster__row', { hasText: CLIENT_NAME }).click()
        await session.page.waitForURL(new RegExp(`/trainer/clients/${CLIENT_ID}\\?tab=nutrition`), { timeout: 10_000 })
        c.ok(true, 'тренер: тап по строке → карточка, вкладка питания')
        await screenshot(session.page, 'food-diary-trainer')
        c.ok(
          session.pageErrors.length === 0,
          `тренер без JS ошибок${session.pageErrors.length ? `: ${session.pageErrors[0]}` : ''}`,
        )
      } finally {
        await session.context.close()
      }
    }

    /* ——— Админ ——— */
    {
      const context = await newE2eContext(browser, backend)
      const page = await context.newPage()
      try {
        await loginUi(page, ADMIN.login, ADMIN.password)
        await page.goto(`${ORIGIN}/admin/structure?tab=clubs`, { waitUntil: 'domcontentloaded' })
        c.ok(await reaches(page.getByText('Дневник калорий (клиент)')), 'админ: переключатель дневника у клуба')
        await screenshot(page, 'food-diary-admin')
      } finally {
        await context.close()
      }
    }
  } catch (e) {
    c.ok(false, `сценарий прерван: ${String(e?.message ?? e).split('\n')[0]}`)
  }

  return c.failures
}
