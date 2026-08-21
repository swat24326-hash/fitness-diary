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

/** Второй тап «Закончить», пока первый ещё идёт. */
export function shouldSkipDuplicateCompleteClick(inFlight) {
  return inFlight === true
}

/**
 * На диске уже completed, а этот persist думал, что это первое завершение.
 * Не перезаписывать штамп баллов и не списывать абон второй раз.
 */
export function shouldSkipDuplicateFirstCompletionSave(diskStatus, thisPersistIsFirstCompletion) {
  return Boolean(thisPersistIsFirstCompletion) && isTrainingStatusCompleted(diskStatus)
}

/** Автосейв черновика не затирает уже завершённую на диске. */
export function shouldSkipSilentPersistOfCompleted(diskStatus, silent) {
  return silent === true && isTrainingStatusCompleted(diskStatus)
}

/**
 * Пока идёт «Закончить», silent-автосейв не занимает mutex и IndexedDB.
 * На слабых планшетах иначе «Сохраняем…» + мигание «Сохранение…» висят минутами.
 */
export function shouldSkipSilentPersistWhileCompleteInFlight(silent, completeInFlight) {
  return silent === true && completeInFlight === true
}
