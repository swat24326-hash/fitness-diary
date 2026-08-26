/**
 * Чистая логика: какие локальные тренировки клиента удалить после pull с сервера.
 * Не удаляем: draft, pending в sync_queue, synced:false, свежие правки (grace после flush).
 */

import { rowRevisionMs } from './syncPullGuardCore.js'

/** После успешного push облако может ещё не отдавать строку — не prune-ить свежие локальные. */
export const TRAINING_ORPHAN_PRUNE_GRACE_MS = 120_000

/**
 * Нельзя считать remote полным списком для orphan-prune.
 * @param {{
 *   remoteTrainings?: object[] | null,
 *   localTrainings?: object[] | null,
 *   truncated?: boolean,
 * }} ctx
 */
export function shouldSkipClientTrainingsOrphanPrune(ctx = {}) {
  if (ctx.truncated === true) return true
  return false
}

/**
 * @param {object | null | undefined} row
 * @param {number} [nowMs]
 * @param {number} [graceMs]
 */
export function isTrainingWithinOrphanPruneGrace(row, nowMs = Date.now(), graceMs = TRAINING_ORPHAN_PRUNE_GRACE_MS) {
  const rev = rowRevisionMs(row)
  if (!rev) return false
  const grace = Math.max(0, Number(graceMs) || 0)
  return nowMs - rev <= grace
}

/**
 * @param {string} clientId
 * @param {object[]} localTrainings
 * @param {object[]} remoteTrainings
 * @param {Set<string>|string[]|null} pendingTrainingIds — id из sync_queue (insert/update/delete)
 * @param {{ nowMs?: number, graceMs?: number }} [opts]
 * @returns {string[]} id локальных тренировок, которые можно удалить
 */
export function trainingIdsToPruneForClient(
  clientId,
  localTrainings,
  remoteTrainings,
  pendingTrainingIds,
  opts = {},
) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []

  const remoteIds = new Set(
    (remoteTrainings ?? [])
      .map((t) => String(t?.id ?? '').trim())
      .filter(Boolean),
  )
  const pending =
    pendingTrainingIds instanceof Set
      ? pendingTrainingIds
      : new Set((pendingTrainingIds ?? []).map(String).filter(Boolean))

  const nowMs = Number(opts.nowMs) || Date.now()
  const graceMs = opts.graceMs ?? TRAINING_ORPHAN_PRUNE_GRACE_MS

  const out = []
  for (const t of localTrainings ?? []) {
    if (String(t?.client_id ?? '') !== cid) continue
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    if (String(t?.status ?? '') === 'draft') continue
    // Как shouldPreserveLocalRowFromCloudPull: локальная незасинхронизированная правда
    if (t?.synced === false) continue
    if (isTrainingWithinOrphanPruneGrace(t, nowMs, graceMs)) continue
    if (remoteIds.has(id)) continue
    if (pending.has(id)) continue
    out.push(id)
  }
  return out
}
