/**
 * Группировка archive_reason для mix KPI.
 */

import { ARCHIVE_REASON_MIX_GROUPS, matchArchiveReasonChip } from '../clientArchiveReasonCore.js'

export { ARCHIVE_REASON_MIX_GROUPS }

/**
 * @param {string|null|undefined} reason
 * @returns {string}
 */
export function archiveReasonMixGroupId(reason) {
  const chip = matchArchiveReasonChip(reason)
  if (chip?.chipId && chip.chipId !== 'other') return chip.chipId
  const text = String(reason ?? '').trim()
  if (!text) return 'unknown'
  return 'other'
}

/**
 * @param {Array<{ archive_reason?: string | null }>} archivedClients
 * @returns {{ total: number, byGroup: Record<string, number>, byLabel: Record<string, number> }}
 */
export function aggregateArchiveReasonMix(archivedClients) {
  /** @type {Record<string, number>} */
  const byGroup = {}
  /** @type {Record<string, number>} */
  const byLabel = {}
  let total = 0
  for (const c of archivedClients ?? []) {
    const reason = c?.archive_reason ?? null
    const gid = archiveReasonMixGroupId(reason)
    byGroup[gid] = (byGroup[gid] ?? 0) + 1
    const label =
      ARCHIVE_REASON_MIX_GROUPS.find((g) => g.id === gid)?.label ??
      (gid === 'unknown' ? 'Без причины' : 'Другое / свой текст')
    byLabel[label] = (byLabel[label] ?? 0) + 1
    total += 1
  }
  return { total, byGroup, byLabel }
}
