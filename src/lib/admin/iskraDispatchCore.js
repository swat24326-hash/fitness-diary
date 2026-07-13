/**
 * ИСКРА Dispatch — задачи сотрудникам (task-менеджер, не чат).
 */

import {
  formatDispatchDueLabel,
  isDispatchOverdue,
  resolveDeepLinkForTaskKind,
  resolveTaskKindFromInsight,
  suggestDefaultDuePreset,
  suggestPriorityFromInsight,
  ISKRA_TASK_KINDS,
  ISKRA_TASK_PRIORITIES,
  resolveDueAtFromPreset,
} from './iskraTaskKindsCore.js'
import { normalizeStaffTaskContextJson, STAFF_TASK_SOURCE_CHANNELS } from './staffTaskCreateCore.js'
import { resolveDispatchDeepLink } from './staffTaskDeepLinkCore.js'

/** Компактные строки открытых заданий для промпта Gemini. */
export function compactOpenDispatchForPrompt(rows) {
  return (rows ?? []).slice(0, 12).map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    title: t.title,
    recipient_user_id: t.recipient_user_id,
    priority: t.priority,
    task_kind: t.task_kind,
    due_at: t.due_at,
  }))
}

/** @typedef {'message' | 'task'} IskraDispatchKind */
/** @typedef {'pending' | 'seen' | 'accepted' | 'done' | 'dismissed' | 'declined'} IskraDispatchStatus */
/** @typedef {'iskra_insight' | 'iskra_manual' | 'admin'} IskraDispatchSource */

export const ISKRA_DISPATCH_KINDS = /** @type {const} */ (['message', 'task'])
export const ISKRA_DISPATCH_STATUSES = /** @type {const} */ ([
  'pending',
  'seen',
  'accepted',
  'done',
  'dismissed',
  'declined',
])

export const ISKRA_DISPATCH_ACTIVE_STATUSES = /** @type {const} */ (['pending', 'seen', 'accepted'])

/**
 * @param {object} card insight card
 * @param {{ periodLabel?: string, clubName?: string }} [opts]
 */
export function buildDispatchFromInsightCard(card, opts = {}) {
  const club = String(opts.clubName ?? 'клуб').trim()
  const period = String(opts.periodLabel ?? 'месяц').trim()
  const headline = String(card?.headline ?? 'Задача от ИСКРЫ').trim()
  const action = String(card?.action ?? '').trim()
  const evidence = String(card?.evidence ?? '').trim()
  const impact = String(card?.impactLabel ?? '').trim()
  const insightKey = String(card?.id ?? '').trim()
  const taskKind = resolveTaskKindFromInsight(insightKey)

  const title = `ИСКРА · ${headline}`
  const lines = [
    `Клуб: ${club}, период: ${period}.`,
    action,
    evidence ? `Контекст: ${evidence}.` : '',
    impact ? impact : '',
    'Примите задание и отметьте выполнение до дедлайна.',
  ].filter(Boolean)

  return {
    kind: /** @type {IskraDispatchKind} */ ('task'),
    title: title.slice(0, 200),
    body: lines.join(' ').slice(0, 2000),
    source: /** @type {IskraDispatchSource} */ ('iskra_insight'),
    source_channel: 'iskra_insight_card',
    insight_key: insightKey,
    task_kind: taskKind,
    deep_link: resolveDeepLinkForTaskKind(taskKind),
    priority: suggestPriorityFromInsight(insightKey),
    due_preset: suggestDefaultDuePreset(insightKey),
    context_json: { insight_key: insightKey },
  }
}

/**
 * @param {object} raw
 * @returns {{ ok: true, ids: string[] } | { ok: false, error: string }}
 */
export function normalizeRecipientUserIds(raw) {
  const single = String(raw?.recipient_user_id ?? '').trim()
  const many = Array.isArray(raw?.recipient_user_ids)
    ? raw.recipient_user_ids.map((x) => String(x).trim()).filter(Boolean)
    : []
  const ids = [...new Set(many.length ? many : single ? [single] : [])]
  if (!ids.length) return { ok: false, error: 'Укажите хотя бы одного исполнителя' }
  if (ids.length > 30) return { ok: false, error: 'Не больше 30 исполнителей за раз' }
  return { ok: true, ids }
}

/**
 * @param {object} raw
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function normalizeDispatchCreatePayload(raw) {
  const clubId = String(raw?.club_id ?? '').trim()
  const recipientIds = normalizeRecipientUserIds(raw)
  if (!recipientIds.ok) return recipientIds
  const recipientId = recipientIds.ids[0]
  const kind = String(raw?.kind ?? 'task').trim()
  const title = String(raw?.title ?? '').trim()
  const body = String(raw?.body ?? '').trim()
  const insightKey = String(raw?.insight_key ?? '').trim()

  if (!clubId) return { ok: false, error: 'Укажите club_id' }
  if (!ISKRA_DISPATCH_KINDS.includes(kind)) return { ok: false, error: 'Некорректный kind' }
  if (!title) return { ok: false, error: 'Укажите заголовок' }
  if (!body) return { ok: false, error: 'Укажите текст' }
  if (title.length > 200) return { ok: false, error: 'Заголовок не длиннее 200 символов' }
  if (body.length > 2000) return { ok: false, error: 'Текст не длиннее 2000 символов' }

  const year = Number(raw?.period_year)
  const month = Number(raw?.period_month)

  let taskKind = String(raw?.task_kind ?? '').trim()
  if (!ISKRA_TASK_KINDS.includes(taskKind)) {
    taskKind = insightKey ? resolveTaskKindFromInsight(insightKey) : 'custom'
  }

  let priority = String(raw?.priority ?? 'normal').trim()
  if (!ISKRA_TASK_PRIORITIES.includes(priority)) {
    priority = insightKey ? suggestPriorityFromInsight(insightKey) : 'normal'
  }

  let dueAt = raw?.due_at ? String(raw.due_at).trim() : null
  if (!dueAt && raw?.due_preset) {
    dueAt = resolveDueAtFromPreset(String(raw.due_preset))
  }

  const deepLink = String(raw?.deep_link ?? '').trim() || resolveDeepLinkForTaskKind(taskKind)

  const reply = String(raw?.recipient_reply ?? '').trim()
  if (reply.length > 500) return { ok: false, error: 'Ответ не длиннее 500 символов' }

  const source = ['iskra_insight', 'iskra_manual', 'admin'].includes(String(raw?.source))
    ? String(raw.source)
    : 'admin'

  let sourceChannel = String(raw?.source_channel ?? '').trim()
  if (!STAFF_TASK_SOURCE_CHANNELS.includes(sourceChannel)) {
    sourceChannel = ''
  }
  if (!sourceChannel) {
    sourceChannel = source === 'admin' ? 'manual_app' : source === 'iskra_insight' ? 'iskra_insight_card' : ''
  }

  return {
    ok: true,
    payload: {
      club_id: clubId,
      recipient_user_id: recipientId,
      kind,
      title,
      body,
      source,
      source_channel: sourceChannel,
      insight_key: insightKey.slice(0, 80),
      period_year: Number.isFinite(year) ? Math.trunc(year) : null,
      period_month: Number.isFinite(month) && month >= 1 && month <= 12 ? Math.trunc(month) : null,
      task_kind: taskKind,
      priority,
      due_at: dueAt,
      deep_link: deepLink.slice(0, 300),
      context_json: normalizeStaffTaskContextJson(raw?.context_json),
    },
  }
}

/**
 * Админ может удалить отправленное задание (очистка списка / отзыв до выполнения).
 * @param {string} [status]
 */
export function canAdminDeleteDispatch(status) {
  const s = String(status ?? '').trim()
  return !s || ISKRA_DISPATCH_STATUSES.includes(s)
}

/**
 * @param {object} raw
 * @returns {{ ok: true, dispatch_id: string, club_id?: string } | { ok: false, error: string }}
 */
export function normalizeDispatchDeletePayload(raw) {
  const dispatchId = String(raw?.dispatch_id ?? raw?.id ?? '').trim()
  const clubId = String(raw?.club_id ?? '').trim()
  if (!dispatchId) return { ok: false, error: 'Укажите dispatch_id' }
  return { ok: true, dispatch_id: dispatchId, club_id: clubId || undefined }
}

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 */
export function canTransitionDispatchStatus(fromStatus, toStatus) {
  const from = String(fromStatus ?? '').trim()
  const to = String(toStatus ?? '').trim()
  if (!ISKRA_DISPATCH_STATUSES.includes(to)) return false
  if (from === to) return true

  const map = {
    pending: new Set(['seen', 'accepted', 'done', 'dismissed', 'declined']),
    seen: new Set(['accepted', 'done', 'dismissed', 'declined']),
    accepted: new Set(['done', 'dismissed', 'declined']),
    done: new Set([]),
    dismissed: new Set([]),
    declined: new Set([]),
  }
  return map[from]?.has(to) ?? false
}

/**
 * @param {string} status
 * @deprecated use canTransitionDispatchStatus
 */
export function isValidDispatchStatusTransition(status) {
  return ['seen', 'accepted', 'done', 'dismissed', 'declined'].includes(String(status ?? ''))
}

/**
 * @param {Array<object>} rows
 */
export function countPendingDispatch(rows) {
  return countActiveDispatch(rows)
}

/**
 * @param {Array<object>} rows
 */
export function countActiveDispatch(rows) {
  return (rows ?? []).filter((r) => ISKRA_DISPATCH_ACTIVE_STATUSES.includes(String(r?.status ?? ''))).length
}

/**
 * @param {object} row
 */
export function formatDispatchForUi(row) {
  const dueAt = row.due_at ?? null
  const status = String(row.status ?? 'pending')
  return {
    id: String(row.id ?? ''),
    club_id: String(row.club_id ?? ''),
    sender_user_id: String(row.sender_user_id ?? ''),
    recipient_user_id: String(row.recipient_user_id ?? ''),
    kind: String(row.kind ?? 'task'),
    status,
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    source: String(row.source ?? 'admin'),
    source_channel: String(row.source_channel ?? ''),
    context_json: row.context_json && typeof row.context_json === 'object' ? row.context_json : {},
    insight_key: String(row.insight_key ?? ''),
    task_kind: String(row.task_kind ?? 'custom'),
    priority: String(row.priority ?? 'normal'),
    due_at: dueAt,
    due_label: formatDispatchDueLabel(dueAt),
    is_overdue: isDispatchOverdue(dueAt) && ISKRA_DISPATCH_ACTIVE_STATUSES.includes(status),
    deep_link: resolveDispatchDeepLink({
      deep_link: row.deep_link,
      task_kind: String(row.task_kind ?? 'custom'),
      context_json: row.context_json && typeof row.context_json === 'object' ? row.context_json : {},
      recipient_role: 'trainer',
    }),
    period_year: row.period_year ?? null,
    period_month: row.period_month ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    seen_at: row.seen_at ?? null,
    accepted_at: row.accepted_at ?? null,
    completed_at: row.completed_at ?? null,
    declined_at: row.declined_at ?? null,
    recipient_reply: String(row.recipient_reply ?? '').trim(),
    sender_name: String(row.sender_name ?? '').trim() || 'ИСКРА',
    recipient_name: String(row.recipient_name ?? '').trim(),
  }
}

/**
 * @param {string} status
 */
export function dispatchStatusLabelRu(status) {
  const map = {
    pending: 'Новое',
    seen: 'Просмотрено',
    accepted: 'В работе',
    done: 'Выполнено',
    dismissed: 'Скрыто',
    declined: 'Отклонено',
  }
  return map[String(status ?? '')] ?? 'Задание'
}
