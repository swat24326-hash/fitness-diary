/** Статус тренировки при persist: завершённую нельзя тихо откатить в черновик. */

export function isTrainingStatusCompleted(status) {
  return String(status ?? '').trim().toLowerCase() === 'completed'
}

export function resolveTrainingPersistStatus(requested, previousStatus) {
  if (isTrainingStatusCompleted(previousStatus)) return 'completed'
  if (isTrainingStatusCompleted(requested)) return 'completed'
  return 'draft'
}

/** Чеклист завершения и списание абона — только переход draft → completed. */
export function isTrainingFirstCompletion(previousStatus, nextStatus) {
  return isTrainingStatusCompleted(nextStatus) && !isTrainingStatusCompleted(previousStatus)
}
