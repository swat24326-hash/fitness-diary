/**
 * Два открытых черновика (код A, INC-2026-08-21-02 / 08-31-01 / 09-02-01):
 * ввод у одного клиента → тап по вкладке другого, не убирая фокус → туда-обратно.
 * Ждём: у каждого клиента только свои упражнения и цифры, на сервер уходит то же самое.
 */
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT2_ID, CLIENT_ID, twoClientsSeed } from '../lib/fixtures.mjs'
import { openClientCard, openTrainerSession, startNewTraining, tapSync, waitSyncLabel } from '../lib/trainerSteps.mjs'
import { pickCatalogExercise } from '../lib/trainingFormSteps.mjs'

export const name = 'тренер: два черновика, переключение вкладок'

async function openExercisesTab(page) {
  await page.getByRole('tablist').getByRole('button', { name: '3. Упражнения', exact: true }).click()
}

async function switchToDraft(page, surname) {
  await page.getByRole('region', { name: 'Черновики тренера' }).getByRole('link', { name: surname }).click()
  await page.getByRole('heading', { level: 1, name: new RegExp(surname) }).waitFor({ timeout: 15_000 })
  await openExercisesTab(page)
}

async function readExercises(page) {
  const names = await page.getByRole('textbox', { name: 'Упражнение: поиск по справочнику' }).evaluateAll((els) =>
    els.map((el) => el.value),
  )
  const reps = await page.getByRole('textbox', { name: 'Повторы' }).evaluateAll((els) => els.map((el) => el.value))
  return { names, reps }
}

function serverDraft(state, clientId) {
  return state.trainings.find((t) => t.client_id === clientId && t.status === 'draft')
}

export async function run(browser) {
  const c = createChecks('two-drafts')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, twoClientsSeed())
  try {
    await openClientCard(page, CLIENT_ID)
    await startNewTraining(page)
    await openExercisesTab(page)
    await pickCatalogExercise(page, 'Жим', 'Жим лёжа')
    await page.getByRole('textbox', { name: 'Повторы' }).first().fill('10')

    await openClientCard(page, CLIENT2_ID)
    await startNewTraining(page)
    await openExercisesTab(page)
    await pickCatalogExercise(page, 'Присед', 'Присед со штангой')
    /* Ввод без blur и сразу тап по чужой вкладке — так терялись и перетекали цифры. */
    await page.getByRole('textbox', { name: 'Повторы' }).first().pressSequentially('5')

    await switchToDraft(page, 'Тестова')
    const anna = await readExercises(page)
    c.ok(anna.names.join('|') === 'Жим лёжа', `у Тестовой только «Жим лёжа» (видно: ${anna.names.join(', ') || 'пусто'})`)
    c.ok(anna.reps[0] === '10', `у Тестовой повторы 10 (видно: ${anna.reps.join(', ')})`)
    await page.getByRole('textbox', { name: 'Повторы' }).first().fill('12')

    await switchToDraft(page, 'Проверкин')
    const boris = await readExercises(page)
    c.ok(
      boris.names.join('|') === 'Присед со штангой',
      `у Проверкина только «Присед со штангой» (видно: ${boris.names.join(', ') || 'пусто'})`,
    )
    c.ok(boris.reps[0] === '5', `у Проверкина повторы 5, ввод перед тапом не потерян (видно: ${boris.reps.join(', ')})`)

    await switchToDraft(page, 'Тестова')
    const annaAgain = await readExercises(page)
    c.ok(annaAgain.reps[0] === '12', `правка у Тестовой сохранилась после переключения (видно: ${annaAgain.reps.join(', ')})`)

    await tapSync(page)
    await waitSyncLabel(page, /^синхронизировать/i)
    const { state } = backend
    /* Правка, введённая прямо перед Sync, уходит своим автосохранением чуть позже — это не потеря. */
    await waitFor(
      () =>
        serverDraft(state, CLIENT2_ID)?.data?.exercises?.[0]?.sets?.[0]?.reps === '5' &&
        serverDraft(state, CLIENT_ID)?.data?.exercises?.[0]?.sets?.[0]?.reps === '12',
      15_000,
    )
    const a = serverDraft(state, CLIENT_ID)?.data?.exercises ?? []
    const b = serverDraft(state, CLIENT2_ID)?.data?.exercises ?? []
    c.ok(
      a.length === 1 && a[0].name === 'Жим лёжа' && a[0].sets?.[0]?.reps === '12',
      `сервер: черновик Тестовой = Жим лёжа ×12 (${a.map((x) => `${x.name} ×${x.sets?.[0]?.reps}`).join(', ')})`,
    )
    c.ok(
      b.length === 1 && b[0].name === 'Присед со штангой' && b[0].sets?.[0]?.reps === '5',
      `сервер: черновик Проверкина = Присед ×5 (${b.map((x) => `${x.name} ×${x.sets?.[0]?.reps}`).join(', ')})`,
    )
    const drafts = state.trainings.filter((t) => t.status === 'draft')
    c.ok(drafts.length === 2, `на сервере ровно 2 черновика (${drafts.length})`)
    c.ok(pageErrors.length === 0, `без ошибок JS на странице${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'two-drafts-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
