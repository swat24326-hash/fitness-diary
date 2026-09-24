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

/**
 * Облако уже completed, а в push ещё летит старый draft (гонка автосейва с «Закончить»).
 * Такой flush нельзя применять — иначе ЗП/статистика с сервера откатываются в 0.
 */
export function shouldSkipObsoleteTrainingDraftPush(existingStatus, requestedStatus) {
  return isTrainingStatusCompleted(existingStatus) && !isTrainingStatusCompleted(requestedStatus)
}

/**
 * Draft-update на сервере: писать только пока строка ещё draft (`.eq('status','draft')`).
 * Иначе параллельный completed уже победил — устаревший HTTP draft не должен перезаписать.
 */
export function trainingDraftPushRequiresDraftRowFilter(requestedStatus) {
  return !isTrainingStatusCompleted(requestedStatus)
}

/**
 * Схлопнуть status при merge нескольких push одной тренировки (last-write без учёта completed опасен).
 */
export function mergeTrainingPushStatus(currentStatus, nextStatus) {
  return resolveTrainingPersistStatus(nextStatus, currentStatus)
}

/**
 * Копия / новая тренировка ещё не в облаке: локально строка уже есть, поэтому persist
 * раньше слал update. Пока push insert не доехал, update попадает в пустоту.
 * @param {{ synced?: boolean } | null | undefined} prev
 */
export function shouldEnqueueTrainingAsInsert(prev) {
  if (!prev) return true
  return prev.synced === false
}

/**
 * Update в облаке не задел ни одной строки: insert ещё не доехал (копия → Закончить)
 * или строку уже удалили. Пустой «ок» нельзя считать успехом — иначе очередь снимается,
 * а тренировки в облаке нет.
 * @param {{
 *   operation?: string,
 *   updatedRow?: object | null,
 *   existingRow?: object | null,
 * }} p
 */
export function shouldInsertTrainingAfterEmptyUpdate(p = {}) {
  if (String(p.operation ?? '') === 'insert') return false
  if (p.updatedRow && typeof p.updatedRow === 'object') return false
  if (p.existingRow && typeof p.existingRow === 'object') return false
  return true
}
