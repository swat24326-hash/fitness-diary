/**
 * «Мой профиль», как в Telegram: верх меню → окно с крупным кружком → «Выбрать фото» → обрезка в круг
 * (перетащить, увеличить) → «Готово» → фото в окне и в строке меню; «Удалить» — снова инициалы.
 * Клиент на телефоне (/me) и тренер на планшете (бургер). Сервер — настоящий avatarOp, файлы в памяти.
 */
import { readFileSync } from 'node:fs'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { createFakeClientPortal } from '../lib/fakeClientPortal.mjs'
import { wireAvatars } from '../lib/fakeAvatar.mjs'
import { ORIGIN, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, TRAINER_ID, isoDay, trainerClubSeed, weightHistorySeed } from '../lib/fixtures.mjs'
import { openTrainerSession } from '../lib/trainerSteps.mjs'

export const name = 'мой профиль: фото — выбрать, обрезать, сменить, удалить'

const PHONE = {
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  hasTouch: true,
  isMobile: true,
}
const TABLET = { viewport: { width: 1024, height: 768 } }
const INVITE = 'e2e-avatar-invite'
const PNG = { name: 'me.png', mimeType: 'image/png', buffer: readFileSync(new URL('../../../public/icons/icon-512.png', import.meta.url)) }

const loaded = (img) =>
  img
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() =>
      img.evaluate((el) =>
        el.complete
          ? el.naturalWidth > 0
          : new Promise((resolve) => {
              el.addEventListener('load', () => resolve(el.naturalWidth > 0), { once: true })
              el.addEventListener('error', () => resolve(false), { once: true })
            }),
      ),
    )
    .catch(() => false)

/** Окно открыто: выбрать фото, подвигать, «Готово», убедиться что легло; затем «Удалить». */
async function photoFlow(c, page, row, label, shot, readKey) {
  await row.click()
  const sheet = page.getByTestId('profile-photo-sheet')
  c.ok(await sheet.isVisible(), `${label}: «Мой профиль» открылся`)
  c.ok(await sheet.getByRole('button', { name: 'Выбрать фото' }).isVisible(), `${label}: фото нет — «Выбрать фото»`)

  await page.getByTestId('profile-photo-input').setInputFiles(PNG)
  const stage = page.getByTestId('avatar-crop-stage')
  await stage.waitFor({ timeout: 10_000 })
  await sheet.getByRole('slider', { name: 'Увеличение' }).fill('2')
  const box = await stage.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 5 })
  await page.mouse.up()
  await screenshot(page, `${shot}-crop`)

  await sheet.getByRole('button', { name: 'Готово' }).click()
  c.ok(await loaded(sheet.locator('img.avatar-photo')), `${label}: после «Готово» фото в кружке загрузилось`)
  c.ok(Boolean(readKey()), `${label}: ключ фото записан в профиль`)
  c.ok(await sheet.getByRole('button', { name: 'Сменить фото' }).isVisible(), `${label}: кнопка стала «Сменить фото»`)
  c.ok(await loaded(row.locator('img.avatar-photo')), `${label}: фото и в строке меню`)
  await screenshot(page, `${shot}-saved`)

  await sheet.getByRole('button', { name: 'Удалить' }).click()
  await sheet.getByRole('button', { name: 'Выбрать фото' }).waitFor({ timeout: 10_000 })
  c.ok(!readKey(), `${label}: «Удалить» — ключ стёрт`)
  c.ok((await sheet.locator('img.avatar-photo').count()) === 0, `${label}: в кружке снова инициалы`)
  await sheet.getByRole('button', { name: /Закрыть/ }).click()
  c.ok(!(await sheet.isVisible()), `${label}: окно закрывается`)
}

async function client(c, browser) {
  const backend = createFakeBackend(weightHistorySeed())
  backend.clientMe = createFakeClientPortal(backend.state, { clientId: CLIENT_ID, inviteToken: INVITE, today: isoDay(0) })
  wireAvatars(backend, { clientId: CLIENT_ID })
  const context = await newE2eContext(browser, backend, PHONE)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  try {
    await page.goto(`${ORIGIN}/me/join#t=${INVITE}`)
    await page.waitForURL(`${ORIGIN}/me/`, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Меню', exact: true }).click()
    const row = page.locator('[data-testid="profile-menu-user"]:visible')
    await row.waitFor({ timeout: 10_000 })
    const me = () => backend.state.clients.find((x) => x.id === CLIENT_ID)?.avatar_key
    await photoFlow(c, page, row, 'клиент', 'profile-avatar-client', me)
    c.ok(pageErrors.length === 0, `клиент: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'profile-avatar-client-FAIL').catch(() => null)
    c.ok(false, `клиент: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

async function trainer(c, browser) {
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, trainerClubSeed(), TABLET)
  wireAvatars(backend)
  try {
    await page.getByRole('button', { name: 'Меню аккаунта' }).click()
    const row = page.locator('#app-header-account-menu').getByTestId('profile-menu-user')
    await row.waitFor({ timeout: 10_000 })
    c.ok(await row.isVisible(), 'тренер: своё имя сверху меню, «Настройки» раскрывать не нужно')
    const me = () => backend.state.users.find((x) => x.id === TRAINER_ID)?.avatar_key
    await photoFlow(c, page, row, 'тренер', 'profile-avatar-trainer', me)
    c.ok(await page.locator('#app-header-account-menu').isVisible(), 'тренер: меню под окном не закрылось')
    c.ok(pageErrors.length === 0, `тренер: без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'profile-avatar-trainer-FAIL').catch(() => null)
    c.ok(false, `тренер: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
}

export async function run(browser) {
  const c = createChecks('profile-avatar')
  await client(c, browser)
  await trainer(c, browser)
  return c.failures
}
