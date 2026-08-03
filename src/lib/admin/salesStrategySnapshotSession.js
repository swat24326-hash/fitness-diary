/**
 * Локальный кэш снимка Стратегии (sessionStorage) — чтобы playbook
 * не пропадал при уходе со вкладки / до применения миграции в облаке.
 */

import { hydrateStrategyFromPlanRow, parseStrategySnapshot } from './salesStrategySnapshotCore.js'

/**
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 */
export function strategySnapshotSessionKey(clubId, year, month) {
  return `fd-strategy-snap:${String(clubId ?? '').trim()}:${Number(year)}:${Number(month)}`
}

/**
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 * @param {object} snapshot
 */
export function writeStrategySnapshotSession(clubId, year, month, snapshot) {
  if (typeof sessionStorage === 'undefined') return false
  const parsed = parseStrategySnapshot(snapshot)
  if (!parsed.ok) return false
  try {
    sessionStorage.setItem(
      strategySnapshotSessionKey(clubId, year, month),
      JSON.stringify(parsed.snapshot),
    )
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 */
export function readStrategySnapshotSession(clubId, year, month) {
  if (typeof sessionStorage === 'undefined') return { ok: false, error: 'нет sessionStorage' }
  try {
    const raw = sessionStorage.getItem(strategySnapshotSessionKey(clubId, year, month))
    if (!raw) return { ok: false, error: 'нет локального снимка' }
    return hydrateStrategyFromPlanRow(JSON.parse(raw))
  } catch {
    return { ok: false, error: 'локальный снимок повреждён' }
  }
}
