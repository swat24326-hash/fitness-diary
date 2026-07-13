/**
 * Лента статусов Планёрки в панели ИСКРЫ.
 * scripts/verify-iskra-planerka-feed.mjs
 */

import { dispatchStatusLabelRu } from './iskraDispatchCore.js'

export const PLANERKA_FEED_ACTIVE_STATUSES = ['pending', 'seen', 'accepted']
export const PLANERKA_FEED_DONE_STATUSES = ['done']

const STATUS_SORT_WEIGHT = {
  pending: 0,
  seen: 1,
  accepted: 2,
  done: 3,
  declined: 4,
  dismissed: 5,
}

/**
 * @param {object | null | undefined} row
 */
export function buildPlanerkaFeedItem(row) {
  if (!row || typeof row !== 'object') return null
  const status = String(row.status ?? 'pending')
  const title = String(row.title ?? '').trim() || 'Задание'
  return {
    id: String(row.id ?? ''),
    title: title.length > 72 ? `${title.slice(0, 69)}…` : title,
    status,
    status_label: dispatchStatusLabelRu(status),
    recipient_name: String(row.recipient_name ?? '').trim() || 'Сотрудник',
    due_label: String(row.due_label ?? '').trim() || null,
    is_overdue: row.is_overdue === true,
    is_active: PLANERKA_FEED_ACTIVE_STATUSES.includes(status),
    source: String(row.source ?? ''),
    task_kind: String(row.task_kind ?? 'custom'),
    completed_at: row.completed_at ?? null,
  }
}

/**
 * @param {Array<object>} items
 */
export function buildPlanerkaFeedSummary(items) {
  const list = Array.isArray(items) ? items : []
  const active = list.filter((i) => i.is_active)
  return {
    active_count: active.length,
    overdue_count: active.filter((i) => i.is_overdue).length,
    in_progress_count: active.filter((i) => i.status === 'accepted').length,
    pending_count: active.filter((i) => i.status === 'pending' || i.status === 'seen').length,
    done_recent_count: list.filter((i) => i.status === 'done').length,
  }
}

/**
 * @param {Array<object>} rows formatDispatchForUi rows
 * @param {{ limit?: number }} [opts]
 */
export function buildPlanerkaFeedPayload(rows, opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 8)
  const mapped = (rows ?? [])
    .map((r) => buildPlanerkaFeedItem(r))
    .filter(Boolean)

  const sorted = [...mapped].sort((a, b) => {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1
    const wa = STATUS_SORT_WEIGHT[a.status] ?? 9
    const wb = STATUS_SORT_WEIGHT[b.status] ?? 9
    if (wa !== wb) return wa - wb
    return String(a.title).localeCompare(String(b.title), 'ru')
  })

  const items = sorted.slice(0, limit)
  return {
    summary: buildPlanerkaFeedSummary(items),
    items,
  }
}
