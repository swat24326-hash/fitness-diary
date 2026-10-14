/**
 * Админ → Структура → «Библиотека ДЗ» (монитор): правка встроенного упражнения, «убрать из подбора» и «вернуть»,
 * новое упражнение с подсказками ошибок. Каждое действие уходит на сервер от имени админа.
 */
import { randomUUID } from 'node:crypto'
import { createChecks } from '../lib/e2eChecks.mjs'
import { createFakeBackend } from '../lib/fakeBackend.mjs'
import { ORIGIN, loginUi, newE2eContext, screenshot } from '../lib/e2eHarness.mjs'
import { CLUB_ID, trainerClubSeed } from '../lib/fixtures.mjs'
import { HOMEWORK_LIBRARY } from '../../../src/lib/homework/library/homeworkLibrary.js'

export const name = 'админ: библиотека ДЗ'

const MONITOR = { viewport: { width: 1440, height: 900 } }
const ADMIN_ID = 'e2e00000-0000-4000-8000-0000000000b9'
const ADMIN_LOGIN = 'e2e_admin_hwlib'
const ADMIN_PASSWORD = randomUUID()

function seed() {
  const s = trainerClubSeed()
  s.users.push({ id: ADMIN_ID, login: ADMIN_LOGIN, email: `${ADMIN_LOGIN}@trainer.local`, password: ADMIN_PASSWORD, role: 'admin', name: 'Админ Сети', club_id: CLUB_ID })
  return s
}

async function until(fn, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return fn()
}

export async function run(browser) {
  const c = createChecks('admin-homework-library')
  const backend = createFakeBackend(seed())
  const pushes = () => backend.state.pushLog.filter((p) => p.table === 'homework_library')
  const context = await newE2eContext(browser, backend, MONITOR)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)))
  const base = HOMEWORK_LIBRARY[0]
  const renamed = `${base.name} у дивана`
  try {
    await loginUi(page, ADMIN_LOGIN, ADMIN_PASSWORD)
    await page.goto(`${ORIGIN}/admin/structure?tab=homework-library`)
    await page.locator('.hwlib').waitFor({ timeout: 15_000 })
    c.ok(await page.getByText(`${HOMEWORK_LIBRARY.length} в подборе`).isVisible(), `в подборе все ${HOMEWORK_LIBRARY.length} встроенных упражнений`)
    await screenshot(page, 'admin-homework-library-list')

    const search = page.getByRole('textbox', { name: 'Поиск по названию' })
    await search.fill(base.name)
    await page.getByRole('button', { name: `Изменить «${base.name}»` }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Название').fill(renamed)
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 10_000 })
    await search.fill(renamed)
    c.ok(await until(() => page.locator('.hwlib__status--edited').first().isVisible()), 'правка встроенного — пометка «Изменено»')
    c.ok(
      await until(() => pushes().some((p) => p.id === base.id && p.data.entry?.name === renamed && p.data.updated_by === ADMIN_ID)),
      'правка ушла на сервер от имени админа',
    )

    await page.getByRole('button', { name: `Убрать «${renamed}» из подбора` }).click()
    c.ok(await until(async () => (await page.getByText('Ничего не нашлось').count()) === 1), 'убранное пропало из подбора')
    c.ok(await until(() => pushes().some((p) => p.id === base.id && p.data.is_active === false)), 'на сервер ушло «убрано», не удаление')
    c.ok(!pushes().some((p) => p.op === 'delete'), 'строки не удаляются')
    await page.getByRole('button', { name: /^Убранные/ }).click()
    await page.getByRole('button', { name: 'Вернуть' }).click()
    c.ok(await until(() => pushes().filter((p) => p.id === base.id).at(-1)?.data.is_active === true), '«Вернуть» — снова в подборе')

    await page.getByRole('button', { name: 'Все в подборе' }).click()
    await search.fill('')
    await page.getByRole('button', { name: 'Добавить упражнение' }).click()
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    c.ok(await dialog.getByText('Введите название').isVisible(), 'пустая форма — подсказка у поля, не сохраняется')
    c.ok(await dialog.getByText('Выберите хотя бы одну цель').isVisible(), 'подсказка: нужна цель')
    await dialog.getByLabel('Название').fill('Подъём таза у стены')
    await dialog.getByRole('group', { name: 'Цели' }).getByRole('button', { name: 'ОФП' }).click()
    await dialog.getByLabel(/Как выполнять/).fill('Лёжа на спине, стопы на стене. Поднимите таз и медленно опустите.')
    await dialog.getByLabel(/Главная ошибка техники/).fill('Не прогибайте поясницу')
    await screenshot(page, 'admin-homework-library-form')
    await dialog.getByRole('button', { name: 'Сохранить' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 10_000 })
    c.ok(
      await until(() => pushes().some((p) => /^c_[a-z0-9]{8}$/.test(String(p.id)) && p.op === 'insert' && p.data.entry?.goals?.includes('general'))),
      'новое упражнение ушло на сервер',
    )
    await search.fill('Подъём таза у стены')
    c.ok(await until(() => page.locator('.hwlib__status--custom').first().isVisible()), 'своё упражнение в списке с пометкой «Своё»')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'admin-homework-library-FAIL').catch(() => null)
    c.ok(false, `библиотека ДЗ: сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
