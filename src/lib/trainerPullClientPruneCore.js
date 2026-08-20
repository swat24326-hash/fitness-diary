/**
 * Какие локальные клиенты тренера можно убрать после pull (чистая логика + verify).
 *
 * active  — remote = только живые; архивных в кэше не трогаем.
 * archive — remote = только архив; живых в кэше не трогаем (иначе «Активные 0»).
 * all     — remote = полный список; чистим любых отсутствующих.
 */

/**
 * @param {object[]|null|undefined} localClients
 * @param {object[]|null|undefined} remoteClients
 * @param {Set<string>|null|undefined} pendingClientIds
 * @param {{ mode?: 'active' | 'archive' | 'all' }} [opts]
 * @returns {string[]}
 */
export function planTrainerOrphanClientPrune(localClients, remoteClients, pendingClientIds, opts = {}) {
  const mode = String(opts?.mode ?? 'active')
  const remoteIds = new Set(
    (remoteClients ?? []).map((c) => String(c?.id ?? '').trim()).filter(Boolean),
  )
  const toPrune = []
  for (const c of localClients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    if (remoteIds.has(id)) continue
    if (pendingClientIds?.has(id)) continue
    const archived = Boolean(c?.archived_at)
    if (mode === 'active' && archived) continue
    if (mode === 'archive' && !archived) continue
    toPrune.push(id)
  }
  return toPrune
}

/**
 * После archive-only / truncated / active pull нельзя чистить очередь и тренировки
 * по неполному списку клиентов. Полный side-prune — только mode `all` без truncation.
 * @param {'active' | 'archive' | 'all' | string} mode
 * @param {{ trainingsTruncated?: boolean }} [opts]
 */
export function shouldPruneTrainerPullSideEffects(mode, opts = {}) {
  const m = String(mode ?? 'active')
  if (m === 'all' && opts?.trainingsTruncated !== true) {
    return { pruneTrainings: true, purgeSyncQueue: true }
  }
  return { pruneTrainings: false, purgeSyncQueue: false }
}

/**
 * Симуляция: active-pull → archive-pull → что остаётся в кэше (id).
 * @param {object[]} localBefore
 * @param {object[]} activeRemote
 * @param {object[]} archiveRemote
 * @returns {{ afterActive: string[], afterArchive: string[], liveAfterArchive: string[] }}
 */
export function simulateTrainerActiveThenArchivePull(localBefore, activeRemote, archiveRemote) {
  let local = [...(localBefore ?? [])]
  const apply = (remote, mode) => {
    const byId = new Map(local.map((c) => [String(c.id), { ...c }]))
    for (const row of remote ?? []) {
      const id = String(row?.id ?? '').trim()
      if (!id) continue
      byId.set(id, { ...byId.get(id), ...row })
    }
    const merged = [...byId.values()]
    const prune = new Set(planTrainerOrphanClientPrune(merged, remote, new Set(), { mode }))
    local = merged.filter((c) => !prune.has(String(c.id)))
  }
  apply(activeRemote, 'active')
  const afterActive = local.map((c) => String(c.id))
  apply(archiveRemote, 'archive')
  const afterArchive = local.map((c) => String(c.id))
  const liveAfterArchive = local.filter((c) => !c?.archived_at).map((c) => String(c.id))
  return { afterActive, afterArchive, liveAfterArchive }
}
