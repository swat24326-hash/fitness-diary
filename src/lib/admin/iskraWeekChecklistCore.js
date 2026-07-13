/**
 * Чеклист недели — 3 действия от ИСКРЫ (localStorage на клиенте).
 */

import { buildEnrichedIskraAdviceCards } from './iskraActionImpactCore.js'

/**
 * @param {object | null | undefined} snapshot
 * @param {{ limit?: number, advisorRoleId?: string }} [opts]
 */
export function buildWeekChecklistItems(snapshot, opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 3)
  const cards = buildEnrichedIskraAdviceCards(snapshot, {
    advisorRoleId: opts.advisorRoleId ?? 'app_admin',
    limit,
  })
  return cards.map((c) => ({
    id: String(c.id ?? ''),
    label: String(c.headline ?? c.action ?? 'Действие').trim(),
    detail: String(c.action ?? '').trim(),
    handlerId: c.doHandlerId ?? 'advice',
    message: c.doMessage ?? 'Что сделать сейчас, чтобы улучшить результат месяца?',
  }))
}

export function weekChecklistStorageKey(clubId, year, month) {
  return `fitness-diary-iskra-checklist-${clubId}-${year}-${month}`
}

/**
 * @param {string} key
 * @returns {Record<string, boolean>}
 */
export function readWeekChecklistState(key) {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** @param {string} key @param {Record<string, boolean>} state */
export function writeWeekChecklistState(key, state) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
