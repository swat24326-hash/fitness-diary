import { getAccessTokenForAdminApi } from './adminApiClient.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 300) }
  }
}

/**
 * @param {{ clubId?: string, view?: 'inbox' | 'sent', status?: string, limit?: number }} opts
 */
export async function fetchIskraDispatch(opts = {}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const params = new URLSearchParams({
    action: 'iskra-dispatch',
    view: opts.view ?? 'inbox',
  })
  if (opts.clubId) params.set('club_id', opts.clubId)
  if (opts.status) params.set('status', opts.status)
  if (opts.limit) params.set('limit', String(opts.limit))

  const res = await fetch(`${apiOrigin()}/api/admin-data?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}

/**
 * @param {{
 *   clubId: string,
 *   recipientUserId?: string,
 *   recipientUserIds?: string[],
 *   title: string,
 *   body: string,
 *   kind?: string,
 *   source?: string,
 *   sourceChannel?: string,
 *   contextJson?: object,
 *   insightKey?: string,
 *   periodYear?: number,
 *   periodMonth?: number,
 *   taskKind?: string,
 *   priority?: string,
 *   dueAt?: string | null,
 *   duePreset?: string,
 *   dueDate?: string,
 *   recurrencePreset?: string,
 *   recurrenceDays?: number,
 *   deepLink?: string,
 * }} opts
 */
export async function createIskraDispatch(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const recipientUserIds = Array.isArray(opts.recipientUserIds)
    ? opts.recipientUserIds.map((x) => String(x).trim()).filter(Boolean)
    : []
  const singleRecipient = String(opts.recipientUserId ?? '').trim()

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=iskra-dispatch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'create',
      club_id: opts.clubId,
      recipient_user_id: singleRecipient || undefined,
      recipient_user_ids: recipientUserIds.length ? recipientUserIds : undefined,
      title: opts.title,
      body: opts.body,
      kind: opts.kind ?? 'task',
      source: opts.source ?? 'iskra_insight',
      source_channel: opts.sourceChannel ?? '',
      context_json: opts.contextJson ?? {},
      insight_key: opts.insightKey ?? '',
      period_year: opts.periodYear,
      period_month: opts.periodMonth,
      task_kind: opts.taskKind,
      priority: opts.priority,
      due_at: opts.dueAt,
      due_preset: opts.duePreset,
      due_date: opts.dueDate,
      recurrence_preset: opts.recurrencePreset,
      recurrence_days: opts.recurrenceDays,
      deep_link: opts.deepLink,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}

/**
 * @param {{ dispatchId: string, clubId?: string }} opts
 */
export async function deleteIskraDispatch(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии администратора')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=iskra-dispatch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'delete',
      dispatch_id: opts.dispatchId,
      club_id: opts.clubId,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}

/**
 * @param {{ dispatchId?: string, seriesId?: string, clubId: string }} opts
 */
export async function stopIskraDispatchRecurrence(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=iskra-dispatch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'stop_recurrence',
      dispatch_id: opts.dispatchId,
      series_id: opts.seriesId,
      club_id: opts.clubId,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}

/**
 * @param {{
 *   dispatchId: string,
 *   status: 'seen' | 'accepted' | 'done' | 'dismissed' | 'declined',
 *   recipientReply?: string,
 * }} opts
 */
export async function updateIskraDispatchStatus(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=iskra-dispatch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'update_status',
      dispatch_id: opts.dispatchId,
      status: opts.status,
      recipient_reply: opts.recipientReply ?? '',
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}

/**
 * @param {{ dispatchIds: string[] }} opts
 */
export async function markIskraDispatchSeen(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(`${apiOrigin()}/api/admin-data?action=iskra-dispatch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify({
      op: 'mark_seen',
      dispatch_ids: opts.dispatchIds,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка (${res.status})`)
  return data
}
