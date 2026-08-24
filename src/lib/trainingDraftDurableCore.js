/**
 * Правила durable-снимка черновика тренировки (блокировка экрана / kill вкладки).
 * Чистая логика без React / storage — для verify.
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
export function draftRevisionMs(value) {
  if (value == null) return 0
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000
  const ms = Date.parse(String(value ?? ''))
  return Number.isFinite(ms) ? ms : 0
}

/**
 * @param {object | null | undefined} idbRow
 * @returns {number}
 */
export function idbTrainingRevisionMs(idbRow) {
  if (!idbRow || typeof idbRow !== 'object') return 0
  for (const field of ['updated_at', 'created_at']) {
    const ms = draftRevisionMs(idbRow[field])
    if (ms > 0) return ms
  }
  return 0
}

/**
 * Flush при уходе с экрана — только скрытие, не разблокировка.
 * @param {string | null | undefined} visibilityState
 * @param {{ eventType?: string }} [opts]
 * @returns {boolean}
 */
export function shouldFlushDraftOnPageHide(visibilityState, opts = {}) {
  const ev = String(opts.eventType ?? '')
  if (ev === 'pagehide') return true
  return String(visibilityState ?? '') === 'hidden'
}

/**
 * Ключ durable: uuid тренировки или new:clientId до первого save.
 * @param {{ trainingId?: string | null, clientId?: string | null, isNew?: boolean }} opts
 * @returns {string}
 */
export function resolveTrainingDraftDurableKey(opts = {}) {
  const tid = String(opts.trainingId ?? '').trim()
  if (tid && tid !== 'new') return tid
  const cid = String(opts.clientId ?? '').trim()
  if (cid) return `new:${cid}`
  return ''
}

/**
 * Снимок для localStorage (минимальный контент формы).
 * @param {{
 *   trainingId?: string | null,
 *   clientId?: string | null,
 *   status?: string,
 *   trainingType?: string,
 *   trainingDate?: string,
 *   workoutState?: object,
 *   revisedAt?: string | number,
 * }} input
 * @returns {object | null}
 */
export function buildTrainingDraftDurableSnap(input = {}) {
  const trainingId = String(input.trainingId ?? '').trim()
  const clientId = String(input.clientId ?? '').trim()
  if (!clientId) return null
  const keyId = trainingId && trainingId !== 'new' ? trainingId : ''
  const status = String(input.status ?? 'draft')
  if (status === 'completed') return null
  const revisedAt =
    typeof input.revisedAt === 'string' && input.revisedAt
      ? input.revisedAt
      : new Date().toISOString()
  return {
    v: 1,
    trainingId: keyId || null,
    clientId,
    status: 'draft',
    trainingType: input.trainingType || 'Силовая',
    trainingDate: String(input.trainingDate ?? ''),
    workoutState: input.workoutState && typeof input.workoutState === 'object' ? input.workoutState : {},
    trainerId: String(input.trainerId ?? '').trim() || null,
    clubId: String(input.clubId ?? '').trim() || null,
    revisedAt,
  }
}

/**
 * Можно ли поднять durable поверх строки IDB при hydrate после kill вкладки.
 * @param {{
 *   idbRow?: object | null,
 *   durable?: object | null,
 *   expectClientId?: string | null,
 *   expectTrainingId?: string | null,
 * }} ctx
 * @returns {boolean}
 */
export function shouldPreferDurableDraftOverIdb(ctx = {}) {
  const durable = ctx.durable
  const idbRow = ctx.idbRow
  if (!durable || typeof durable !== 'object') return false
  if (String(durable.status ?? 'draft') === 'completed') return false

  const expectClient = String(ctx.expectClientId ?? '').trim()
  const durableClient = String(durable.clientId ?? '').trim()
  if (!durableClient) return false
  if (expectClient && durableClient !== expectClient) return false

  const expectTid = String(ctx.expectTrainingId ?? '').trim()
  const durableTid = String(durable.trainingId ?? '').trim()
  if (expectTid && expectTid !== 'new') {
    if (durableTid && durableTid !== expectTid) return false
  }

  if (!idbRow || typeof idbRow !== 'object') return true

  const idbStatus = String(idbRow.status ?? '')
  if (idbStatus === 'completed') return false

  const idbClient = String(idbRow.client_id ?? '').trim()
  if (idbClient && durableClient && idbClient !== durableClient) return false

  const idbTid = String(idbRow.id ?? '').trim()
  if (durableTid && idbTid && durableTid !== idbTid) return false

  const durableMs = draftRevisionMs(durable.revisedAt)
  const idbMs = idbTrainingRevisionMs(idbRow)
  // Нет меток — durable только если IDB пустой по упражнениям, иначе не угадываем.
  if (durableMs <= 0 && idbMs <= 0) {
    const idbEx = idbRow.data?.exercises
    const hasIdbEx = Array.isArray(idbEx) && idbEx.length > 0
    return !hasIdbEx
  }
  return durableMs > idbMs
}

/**
 * После успешного IDB-save: durable можно сбросить, если не новее записи.
 * @param {{ durable?: object | null, idbUpdatedAt?: string | null, savedAt?: string | null }} ctx
 * @returns {boolean} true = удалить durable
 */
export function shouldClearDurableAfterIdbSave(ctx = {}) {
  const durable = ctx.durable
  if (!durable || typeof durable !== 'object') return true
  const durableMs = draftRevisionMs(durable.revisedAt)
  const savedMs = Math.max(draftRevisionMs(ctx.idbUpdatedAt), draftRevisionMs(ctx.savedAt))
  if (savedMs <= 0) return false
  return durableMs <= savedMs
}
