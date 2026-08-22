/**
 * Открытый черновик тренировки на экране — pull тренировок откладываем (ручной Sync).
 * In-memory, только вкладка; сброс при unmount / завершении.
 */

let openTrainingId = ''
let openClientId = ''

/** @param {string | null | undefined} trainingId @param {string | null | undefined} [clientId] */
export function setOpenTrainingDraft(trainingId, clientId = '') {
  openTrainingId = String(trainingId ?? '').trim()
  openClientId = String(clientId ?? '').trim()
}

/** @param {string | null | undefined} [trainingId] — если передан, сброс только для этого id */
export function clearOpenTrainingDraft(trainingId) {
  const tid = String(trainingId ?? '').trim()
  if (tid && openTrainingId && openTrainingId !== tid) return
  openTrainingId = ''
  openClientId = ''
}

export function hasOpenTrainingDraft() {
  return Boolean(openTrainingId)
}

/** @returns {{ trainingId: string, clientId: string }} */
export function getOpenTrainingDraft() {
  return { trainingId: openTrainingId, clientId: openClientId }
}

/** @internal verify */
export function resetOpenTrainingDraftForTests() {
  openTrainingId = ''
  openClientId = ''
}
