/**
 * Авто-ДЗ по воскресеньям на планшете тренера — склейка экрана с очередью sync:
 * вкладка «Авто» → «Каждое воскресенье» → настройки уходят на сервер → «Посмотреть» кладёт неделю в редактор →
 * «Пропустить» → после перезагрузки и Sync переключатель и пропуск на месте.
 */
import { formatHomeworkAutoDay, homeworkAutoUpcomingSunday, homeworkWeekSendIso } from '../../../src/lib/homework/auto/homeworkAutoScheduleCore.js'
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
    c.ok(await reaches(page.getByText('Неделя 2 из 4')), 'тренер: видны остальные недели блока')
    const week2Day = formatHomeworkAutoDay(homeworkWeekSendIso(homeworkAutoUpcomingSunday(), 1, 2))
    c.ok(await reaches(page.getByText(week2Day)), 'у второй недели дата через 7 дней')
    c.ok(await reaches(page.getByText('Занятие А · Разминка')), 'тренер: «Посмотреть» — неделя в редакторе, занятие А раскрыто')
    c.ok(await reaches(page.getByText(/^Так уйдёт в воскресенье \d\d\.\d\d/)), 'тренер: подсказка «Так уйдёт в воскресенье»')
    await screenshot(page, 'homework-auto-preview')

    const sessionsRow = page.locator('.homework-auto__row').filter({ hasText: 'Занятий в неделю' })
    const comment = page.locator('.homework-preview__comment textarea')
    const commentStarts = async (prefix) => {
      const until = Date.now() + 10_000
      while (Date.now() < until) {
        const value = await comment.inputValue().catch(() => '')
        if (value.startsWith(prefix)) return true
        await new Promise((r) => setTimeout(r, 200))
      }
      return (await comment.inputValue().catch(() => '')).startsWith(prefix)
    }
    await sessionsRow.getByRole('button', { name: '3', exact: true }).click()
    c.ok(await commentStarts('3 занятия'), 'цифра 3 сразу пишет «3 занятия» в комментарии')
    const fourSessionV = async () => {
      const until = Date.now() + 10_000
      const loc = page.locator('summary', { hasText: 'Занятие В' })
      while (Date.now() < until) {
        if ((await loc.count()) === 4) return true
        await new Promise((r) => setTimeout(r, 200))
      }
      return (await loc.count()) === 4
    }
    c.ok(await fourSessionV(), 'цифра 3 добавляет занятие В во всех четырёх неделях')
    c.ok(await waitFor(() => serverRow(backend)?.sessions === 3, 15_000), 'на сервере 3 занятия')
    await sessionsRow.getByRole('button', { name: '2', exact: true }).click()
    c.ok(await commentStarts('2 занятия'), 'цифра 2 сразу пишет «2 занятия» в комментарии')
    const sessionVGone = async () => {
      const until = Date.now() + 10_000
      const blocks = page.getByText('Занятие В ·')
      while (Date.now() < until) {
        if ((await blocks.count()) === 0) return true
        await new Promise((r) => setTimeout(r, 200))
      }
      return (await blocks.count()) === 0
    }
    c.ok(await sessionVGone(), 'цифра 2 убирает занятие В')
    c.ok(await waitFor(() => serverRow(backend)?.sessions === 2, 15_000), 'на сервере снова 2 занятия')

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
