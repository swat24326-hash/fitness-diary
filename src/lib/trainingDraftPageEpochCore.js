/**
 * Изоляция черновиков при сплите вкладок.
 *
 * load: epoch отсекает устаревший async hydrate в чужой экран.
 * persist: запись на диск по снимку closure всегда в свой trainingId;
 *          epoch только решает, можно ли трогать UI текущего экрана.
 */

/** @param {number} current @param {number} captured */
export function isTrainingDraftEpochCurrent(current, captured) {
  return Number(current) === Number(captured)
}

/**
 * Цель записи: URL существующей тренировки важнее устаревшего meta после смены вкладки.
 * @param {{ routeId?: string | null, metaTrainingId?: string | null, draftRefId?: string | null }} opts
 * @returns {string | null}
 */
export function resolveTrainingPersistTargetId(opts = {}) {
  const routeId = String(opts.routeId ?? '').trim()
  if (routeId && routeId !== 'new') return routeId
  const metaId = String(opts.metaTrainingId ?? '').trim()
  if (metaId) return metaId
  const draftId = String(opts.draftRefId ?? '').trim()
  if (draftId) return draftId
  return null
}

/**
 * Стабильный React key формы: не зависит от meta.trainingId (иначе remount на первом автосейве /new).
 * @param {{ routeId?: string | null, clientId?: string | null }} opts
 */
export function resolveTrainingFormRemountKey(opts = {}) {
  const routeId = String(opts.routeId ?? '').trim()
  if (routeId && routeId !== 'new') return routeId
  const clientId = String(opts.clientId ?? '').trim()
  return clientId ? `new:${clientId}` : 'new'
}

/**
 * После записи: обновлять meta/notice текущего экрана только если вкладка та же.
 * Диск / списание / HR end — вне этого флага.
 * @param {{ currentEpoch: number, persistEpoch: number }} opts
 */
export function shouldApplyTrainingPersistUi(opts = {}) {
  return isTrainingDraftEpochCurrent(opts.currentEpoch, opts.persistEpoch)
}
