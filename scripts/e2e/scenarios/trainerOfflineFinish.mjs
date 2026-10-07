/**
 * Тренер без интернета: новая тренировка → двойной тап «Закончить» → интернет вернулся → Sync.
 * Ждём: на сервере ровно одна завершённая, абонемент списан один раз, повторный Sync не плодит дубли.
 */
import { completedTrainingsOnMembership } from '../../../src/lib/membershipRules.js'
import { createChecks, waitFor } from '../lib/e2eChecks.mjs'
import { screenshot, setCloudOnline } from '../lib/e2eHarness.mjs'
import { CLIENT_ID, MEMBERSHIP_ID, PAST_TRAINING_ID, trainerClubSeed } from '../lib/fixtures.mjs'
import { openClientCard, openTrainerSession, startNewTraining, tapSync, waitSyncLabel } from '../lib/trainerSteps.mjs'
import { fillTrainingForCompletion } from '../lib/trainingFormSteps.mjs'

export const name = 'тренер: офлайн «Закончить» → Sync → абонемент списан один раз'

function newTrainingsOnServer(state) {
  return state.trainings.filter((t) => t.client_id === CLIENT_ID && t.id !== PAST_TRAINING_ID)
}

export async function run(browser) {
  const c = createChecks('offline-finish')
  const { backend, context, page, pageErrors } = await openTrainerSession(browser, trainerClubSeed())
  const { state } = backend
  try {
    await setCloudOnline(context, backend, false)
    await openClientCard(page, CLIENT_ID)
    await startNewTraining(page)
    await fillTrainingForCompletion(page)
    await page.getByRole('button', { name: 'Закончить тренировку' }).dblclick()
    await page.waitForURL(new RegExp(`/trainer/clients/${CLIENT_ID}`), { timeout: 20_000 })
    c.ok(true, 'после «Закончить» без сети — возврат в карточку клиента')
    c.ok(await waitSyncLabel(page, /в очереди/i), 'шапка показывает очередь на отправку')
    c.ok(newTrainingsOnServer(state).length === 0, 'пока сети нет — на сервер ничего не ушло')

    await setCloudOnline(context, backend, true)
    await tapSync(page)
    await waitFor(() => newTrainingsOnServer(state).some((t) => t.status === 'completed'))

    const fresh = newTrainingsOnServer(state)
    c.ok(fresh.length === 1, `на сервере одна новая тренировка (есть ${fresh.length})`)
    c.ok(fresh[0]?.status === 'completed', 'она завершена')
    c.ok(fresh[0]?.data?.membership_id === MEMBERSHIP_ID, 'привязана к абонементу')
    const membership = state.memberships.find((m) => m.id === MEMBERSHIP_ID)
    const used = completedTrainingsOnMembership(membership, state.trainings).length
    c.ok(used === 2, `по дневнику на абонементе 2 занятия (было 1), сейчас ${used}`)
    c.ok(Number(membership.used_trainings) === 2, `used_trainings на сервере = 2, сейчас ${membership.used_trainings}`)
    c.ok(await waitSyncLabel(page, /^синхронизировать/i), 'очередь пуста после Sync')

    await tapSync(page)
    c.ok(newTrainingsOnServer(state).length === 1, 'повторный Sync не создал дубль')

    await openClientCard(page, CLIENT_ID)
    await page.getByRole('tablist').getByRole('button', { name: 'Абонементы' }).click()
    const usage = page.getByText(/Использовано тренировок:\s*2\s*\/\s*8/).first()
    const usageOk = await usage.waitFor({ timeout: 10_000 }).then(() => true, () => false)
    c.ok(usageOk, 'карточка «Абонементы»: «Использовано тренировок: 2 / 8»')
    await screenshot(page, 'offline-finish-memberships')
    c.ok(pageErrors.length === 0, `без ошибок JS на странице${pageErrors.length ? `: ${pageErrors[0]}` : ''}`)
  } catch (e) {
    await screenshot(page, 'offline-finish-FAIL').catch(() => null)
    c.ok(false, `сценарий прерван: ${e.message.split('\n')[0]}`)
  } finally {
    await context.close()
  }
  return c.failures
}
