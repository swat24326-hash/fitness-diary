/**
 * Авто-ДЗ по воскресеньям на планшете тренера — склейка экрана с очередью sync:
 * вкладка «Авто» → «Каждое воскресенье» → настройки уходят на сервер → «Посмотреть» кладёт неделю в редактор →
 * «Пропустить» → после перезагрузки и Sync переключатель и пропуск на месте.
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { ORIGIN, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, completedTodaySeed } from '../lib/fixtures.mjs'
import { openClientCard, openTrainerSession, tapSync } from '../lib/trainerSteps.mjs'

export const name = 'авто-ДЗ: включение по воскресеньям, предпросмотр, пропуск, sync'

function reaches(locator, timeout = 10_000) {
  return locator
    .first()
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false)
}

const serverRow = (backend) => (backend.state.homework_auto ?? []).find((r) => r.client_id === CLIENT_ID)

async function openAutoTab(page) {
  await page.goto(`${ORIGIN}/trainer/clients/${CLIENT_ID}?tab=homework`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: 'Авто' }).click()
}

export async function run(browser) {
  const c = createChecks('homework-auto')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, completedTodaySeed())
  try {
    await openClientCard(page, CLIENT_ID)
    await openAutoTab(page)
    const toggle = page.getByRole('switch', { name: 'Отправлять задание каждое воскресенье' })
    c.ok(await reaches(toggle), 'тренер: во вкладке «Авто» есть «Каждое воскресенье»')
    await page.getByRole('button', { name: 'Набор / тонус', exact: true }).click()
    await toggle.click()
    const confirm = page.getByRole('button', { name: 'Ограничений для дома нет' })
    if (await reaches(confirm, 2_000)) await confirm.click()
    c.ok(await reaches(page.getByText(/^Вс \d\d\.\d\d · неделя 1 из 4$/)), 'тренер: видно, что и когда уйдёт — «Вс дд.мм · неделя 1 из 4»')
    c.ok(!(await page.getByRole('button', { name: 'Подобрать один раз' }).isVisible()), 'тренер: при расписании нет второго «Подобрать» рядом с «Посмотреть»')
    c.ok(await waitFor(() => serverRow(backend)?.enabled === true, 15_000), 'настройки ушли на сервер через очередь sync')
    c.ok(serverRow(backend)?.goal === 'tone', 'на сервере выбранная цель')
    await screenshot(page, 'homework-auto-on')

    await page.getByRole('button', { name: 'Посмотреть неделю' }).click()
    c.ok(await reaches(page.getByText('Занятие А · Разминка')), 'тренер: «Посмотреть» — неделя в редакторе, с разминки')
    c.ok(await reaches(page.getByText(/^Так уйдёт в воскресенье \d\d\.\d\d/)), 'тренер: подсказка «Так уйдёт в воскресенье»')
    await screenshot(page, 'homework-auto-preview')

    await page.getByRole('button', { name: /^Пропустить \d\d\.\d\d$/ }).click()
    c.ok(await reaches(page.getByText('Это воскресенье пропускаем')), 'тренер: воскресенье пропущено')
    c.ok(await waitFor(() => Boolean(serverRow(backend)?.skip_date), 15_000), 'пропуск ушёл на сервер')

    await tapSync(page)
    await openAutoTab(page)
    c.ok(await reaches(page.getByRole('switch', { name: 'Отправлять задание каждое воскресенье', checked: true })), 'после перезагрузки и Sync переключатель включён')
    c.ok(await reaches(page.getByRole('button', { name: /^Не пропускать \d\d\.\d\d$/ })), 'после Sync пропуск на месте')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'homework-auto-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
