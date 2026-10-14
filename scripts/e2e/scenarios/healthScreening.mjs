/**
 * Анкета здоровья на планшете тренера — склейка экрана с очередью sync и авто-ДЗ:
 * карточка → «Здоровье и обмеры» → «Заполнить» → «Сердце: да» + колено → метки, ответы на сервере →
 * Sync не теряет ответы → «Допуск подтверждён» → метки на экране тренировки → во вкладке «Авто» подсказка из анкеты.
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { ORIGIN, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, DONE_TODAY_ID, completedTodaySeed } from '../lib/fixtures.mjs'
import { openTrainerSession, tapSync } from '../lib/trainerSteps.mjs'

export const name = 'анкета здоровья: ответы, метки, допуск, sync, авто-ДЗ'

function reaches(locator, timeout = 10_000) {
  return locator
    .first()
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false)
}

const serverAnswers = (backend) => (backend.state.health_screenings ?? []).find((r) => r.client_id === CLIENT_ID)?.answers

async function openHealthTab(page) {
  await page.goto(`${ORIGIN}/trainer/clients/${CLIENT_ID}?tab=health`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Анкета здоровья' }).waitFor({ timeout: 20_000 })
}

export async function run(browser) {
  const c = createChecks('health-screening')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, completedTodaySeed())
  try {
    await openHealthTab(page)
    await page.getByRole('button', { name: 'Редактировать карту здоровья' }).click()
    await page.locator('form.health-form select').first().selectOption('female')
    const goals = page.getByRole('group', { name: 'Цель' })
    await goals.getByRole('button', { name: 'Снижение веса' }).click()
    await page.getByLabel('Уточнение цели').fill('минус 10 кг к лету')
    c.ok((await goals.getByRole('button', { name: 'Снижение веса' }).getAttribute('aria-pressed')) === 'true', 'цель выбрана кнопкой')
    await screenshot(page, 'health-goal-form')
    await page.locator('form.health-form').getByRole('button', { name: 'Сохранить' }).click()
    c.ok(await reaches(page.getByText('Снижение веса — минус 10 кг к лету')), 'в карте: «Снижение веса — минус 10 кг к лету»')
    c.ok(
      await waitFor(() => (backend.state.health_cards ?? []).some((h) => h.client_id === CLIENT_ID && h.goal === 'Снижение веса — минус 10 кг к лету'), 15_000),
      'цель ушла на сервер одной строкой',
    )
    c.ok(await reaches(page.getByText(/Не заполнена/)), 'тренер: анкета пока не заполнена')
    await page.getByRole('button', { name: 'Заполнить' }).click()

    await page.getByRole('group', { name: 'Сердце' }).getByRole('button', { name: 'Да' }).click()
    await page.getByRole('group', { name: 'Сердце: уточнение' }).getByRole('button', { name: 'Аритмия' }).click()
    await page.getByRole('button', { name: 'Остальное — нет' }).first().click()
    await page.getByRole('group', { name: 'Колено левое' }).getByRole('button', { name: 'Да' }).click()
    await page.getByRole('group', { name: 'Колено левое: что вызывает боль' }).getByRole('button', { name: 'Присед' }).click()

    c.ok(await reaches(page.locator('.hscr-badge--danger', { hasText: 'Сердце: аритмия' })), 'метка «Сердце: аритмия» — красная')
    c.ok(await reaches(page.locator('.hscr-badge--warning', { hasText: 'Колено левое' })), 'метка колена — жёлтая')
    c.ok(await reaches(page.getByText('Нагрузку нужно согласовать')), 'просит согласовать нагрузку')
    c.ok(await reaches(page.getByText(/Для домашних заданий: беречь: .*колени/)), 'видно, что учтёт ДЗ')
    c.ok(
      await waitFor(() => serverAnswers(backend)?.zones?.knee_l?.t?.includes('squat') && serverAnswers(backend)?.clearance?.breath?.a === 'no', 15_000),
      'все ответы, включая быстрые нажатия подряд, ушли на сервер',
    )
    await page.getByRole('group', { name: 'Шагов в день' }).getByRole('button', { name: '5 000 – 10 000' }).click()
    await page.getByRole('group', { name: 'Сколько дней в неделю может заниматься дома' }).getByRole('button', { name: '2 дня' }).click()
    await page.getByRole('button', { name: 'Ничего из этого' }).click()
    c.ok(
      await reaches(page.getByRole('button', { name: 'Ничего из этого', pressed: true }), 5_000),
      'быт: три нажатия подряд — все видны на экране',
    )
    c.ok(
      await waitFor(() => {
        const life = serverAnswers(backend)?.life
        return life?.steps === 'mid' && String(life?.home_days) === '2' && Array.isArray(life?.equipment) && life.equipment.length === 0
      }, 15_000),
      'быт: три нажатия подряд — все ушли на сервер',
    )
    await screenshot(page, 'health-screening-filled')

    await tapSync(page)
    await openHealthTab(page)
    c.ok(await reaches(page.locator('.hscr-badge--danger', { hasText: 'Сердце: аритмия' })), 'после Sync ответы на месте')
    await page.getByRole('button', { name: 'Допуск подтверждён' }).click()
    c.ok(await reaches(page.locator('.hscr__ok', { hasText: /Допуск подтверждён \d/ })), 'допуск подтверждён — с датой')
    c.ok(await waitFor(() => Boolean(serverAnswers(backend)?.cleared?.key), 15_000), 'подтверждение ушло на сервер')

    await page.goto(`${ORIGIN}/trainer/workouts/${DONE_TODAY_ID}`, { waitUntil: 'domcontentloaded' })
    c.ok(await reaches(page.locator('.training-health .hscr-badge', { hasText: 'Сердце' }), 20_000), 'экран тренировки: метки анкеты под именем')
    c.ok(await reaches(page.getByText(/Пульс — не ориентир нагрузки/)), 'экран тренировки: про пульс при сердце')
    await screenshot(page, 'health-screening-training')

    await page.goto(`${ORIGIN}/trainer/clients/${CLIENT_ID}?tab=homework`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: 'Авто' }).click()
    c.ok(await reaches(page.getByText(/^Из анкеты здоровья: беречь: .*колени/)), 'вкладка «Авто»: подсказка из анкеты')
    c.ok(pageErrors.length === 0, `без ошибок JS${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'health-screening-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
