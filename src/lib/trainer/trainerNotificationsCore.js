/**
 * Лента уведомлений тренера (планшет): виртуально из client_plans в IndexedDB.
 * Сообщения-события (не ссылки в карточку): «отправлен · ещё не прочитал» / «прочитал».
 * Непрочитанное для бейджа = тренер ещё не отметил; без приложения pending не кладём.
 */
import { clientNotificationsBadgeText, clientNotificationsEntryLabelRu } from '../client/clientNotificationsCore.js'

export const TRAINER_NOTIFICATIONS_PATH = '/trainer/notifications'
export const COACH_NOTIFICATIONS_PATH = '/coach/notifications'

export { clientNotificationsBadgeText as trainerNotificationsBadgeText, clientNotificationsEntryLabelRu as trainerNotificationsEntryLabelRu }

function clientName(clientsById, id) {
  const get = (cid) => (clientsById instanceof Map ? clientsById.get(cid) : clientsById[cid])
  return String(get(id)?.name ?? '').trim() || 'Клиент'
}

function hasAppLookup(hasAppByClientId, clientId) {
  if (!hasAppByClientId) return null
  if (hasAppByClientId instanceof Map) {
    if (!hasAppByClientId.has(clientId)) return null
    return hasAppByClientId.get(clientId) === true
  }
  if (!Object.prototype.hasOwnProperty.call(hasAppByClientId, clientId)) return null
  return hasAppByClientId[clientId] === true
}

/**
 * @param {object[]} plans — строки client_plans (отметки или полные)
 * @param {Map<string, { name?: string }>|Record<string, { name?: string }>} clientsById
 * @param {{ hasAppByClientId?: Map<string, boolean>|Record<string, boolean> }} [opts]
 *        true/false — знаем статус; нет ключа — не знаем (показываем «ещё не открыл»).
 */
export function buildTrainerNotificationsFromPlans(plans, clientsById = {}, opts = {}) {
  const hasAppByClientId = opts.hasAppByClientId
  /** @type {Map<string, object>} latest pending per client+kind */
  const pendingLatest = new Map()
  const opened = []

  for (const row of plans ?? []) {
    if (!row?.id || !row.sent_at) continue
    const kind = row.kind === 'nutrition' ? 'nutrition' : row.kind === 'homework' ? 'homework' : null
    if (!kind) continue
    const cid = String(row.client_id ?? '')
    const openedAt = row.client_seen_at
    if (openedAt) {
      opened.push(row)
      continue
    }
    const key = `${cid}:${kind}`
    const prev = pendingLatest.get(key)
    if (!prev || String(row.sent_at) > String(prev.sent_at)) pendingLatest.set(key, row)
  }

  const out = []
  for (const row of opened) {
    const kind = row.kind === 'nutrition' ? 'nutrition' : 'homework'
    const cid = String(row.client_id ?? '')
    const name = clientName(clientsById, cid)
    const first = name.split(/\s+/)[0] || name
    const what = kind === 'nutrition' ? 'рацион' : 'задание'
    out.push({
      id: String(row.id),
      kind: `${kind}_opened`,
      title: `${first} прочитал(а) ${what}`,
      body: name,
      created_at: String(row.client_seen_at),
      // Клиент прочитал — для тренера это уже «снятый» статус (история без красной точки).
      read_at: String(row.client_seen_at),
      client_id: cid,
    })
  }

  for (const row of pendingLatest.values()) {
    const kind = row.kind === 'nutrition' ? 'nutrition' : 'homework'
    const cid = String(row.client_id ?? '')
    const app = hasAppLookup(hasAppByClientId, cid)
    // Только если точно есть живой вход в /me. Нет приложения / статус неизвестен —
    // не шумим: иначе «ещё не открыл» висит вечно или приходит зря.
    if (app !== true) continue
    const name = clientName(clientsById, cid)
    const what = kind === 'nutrition' ? 'рацион' : 'задание'
    out.push({
      id: String(row.id),
      kind: `${kind}_pending`,
      title: `${what[0].toUpperCase()}${what.slice(1)} отправлен · ещё не прочитал`,
      body: name,
      created_at: String(row.sent_at),
      read_at: null,
      client_id: cid,
    })
  }

  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return out
}

/** client_id из неоткрытых планов — чтобы узнать has_app одним проходом. */
export function trainerNotificationPendingClientIds(plans) {
  const ids = new Set()
  for (const row of plans ?? []) {
    if (!row?.id || !row.sent_at || row.client_seen_at) continue
    if (row.kind !== 'nutrition' && row.kind !== 'homework') continue
    const cid = String(row.client_id ?? '').trim()
    if (cid) ids.add(cid)
  }
  return [...ids]
}

export function trainerNotificationsUnreadCount(items) {
  return (items ?? []).reduce((n, it) => n + (it?.read_at ? 0 : 1), 0)
}

/** Счётчик на кнопке «Входящие» в шапке: задания Планёрки + ждущие открытия клиентом. */
export function trainerInboxHeaderBadgeCount(planerkaPending, clientUnread) {
  return Math.max(0, Number(planerkaPending) || 0) + Math.max(0, Number(clientUnread) || 0)
}

export function trainerInboxHeaderLabelRu(planerkaPending, clientUnread) {
  const pk = Math.max(0, Number(planerkaPending) || 0)
  const cl = Math.max(0, Number(clientUnread) || 0)
  const total = pk + cl
  if (!total) return 'Входящие — Планёрка и клиенты'
  const parts = []
  if (pk) parts.push(`Планёрка: ${pk}`)
  if (cl) parts.push(`от клиентов: ${cl}`)
  return `Входящие · ${parts.join(', ')}`
}
