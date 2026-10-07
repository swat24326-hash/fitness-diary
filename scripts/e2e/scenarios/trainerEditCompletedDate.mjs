/**
 * Тренер открывает завершённую тренировку, переносит на вчера, «Сохранить», Sync; потом сохраняет ещё раз.
 * Ждём: та же строка с новой датой, осталась завершённой, абонемент не списан повторно.
 */
import { completedTrainingsOnMembership } from '../../../src/lib/membershipRules.js'
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { ORIGIN, screenshot } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, DONE_TODAY_ID, MEMBERSHIP_ID, completedTodaySeed, isoDay } from '../lib/fixtures.mjs'
import { openTrainerSession, tapSync, waitSyncLabel } from '../lib/trainerSteps.mjs'

export const name = 'тренер: правка завершённой со сменой даты'

async function openCompleted(page) {
  await page.goto(`${ORIGIN}/trainer/workouts/${DONE_TODAY_ID}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Сохранить', exact: true }).waitFor({ timeout: 20_000 })
}

async function saveAndLeave(page) {
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.includes(DONE_TODAY_ID), { timeout: 20_000 })
}

export async function run(browser) {
  const c = createChecks('edit-completed-date')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, completedTodaySeed())
  const { state } = backend
  const yesterday = isoDay(-1)
  const row = () => state.trainings.find((t) => t.id === DONE_TODAY_ID)
  try {
    await openCompleted(page)
    await page.getByRole('textbox', { name: 'Дата тренировки' }).fill(yesterday)
    await saveAndLeave(page)
    await tapSync(page)
    await waitFor(() => row()?.date === yesterday)

    c.ok(row()?.date === yesterday, `на сервере дата перенесена на ${yesterday} (сейчас ${row()?.date})`)
    c.ok(row()?.status === 'completed', `тренировка осталась завершённой (статус ${row()?.status})`)
    c.ok(row()?.data?.exercises?.[0]?.sets?.[0]?.weight_kg === '40', 'упражнения не потерялись при правке')
    const clientRows = state.trainings.filter((t) => t.client_id === CLIENT_ID)
    c.ok(clientRows.length === 2, `новых строк не появилось (у клиента ${clientRows.length}, ждём 2)`)
    const membership = state.memberships.find((m) => m.id === MEMBERSHIP_ID)
    const used = completedTrainingsOnMembership(membership, state.trainings).length
    c.ok(used === 2, `на абонементе по-прежнему 2 занятия, сейчас ${used}`)
    c.ok(Number(membership.used_trainings) <= 2, `used_trainings не вырос (${membership.used_trainings})`)

    await openCompleted(page)
    const shown = await page.getByRole('textbox', { name: 'Дата тренировки' }).inputValue()
    c.ok(shown === yesterday, `повторное открытие показывает новую дату (${shown})`)
    await saveAndLeave(page)
    await tapSync(page)
    c.ok(await waitSyncLabel(page, /^синхронизировать/i), 'очередь пуста после повторного сохранения')
    c.ok(row()?.status === 'completed' && row()?.date === yesterday, 'повторное «Сохранить» ничего не откатило')
    const usedAfter = completedTrainingsOnMembership(
      state.memberships.find((m) => m.id === MEMBERSHIP_ID),
      state.trainings,
    ).length
    c.ok(usedAfter === 2, `после повторного сохранения на абонементе 2 занятия (${usedAfter})`)
    c.ok(pageErrors.length === 0, `без ошибок JS на странице${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'edit-completed-date-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
