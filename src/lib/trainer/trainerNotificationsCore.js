/**
 * Лента уведомлений тренера (планшет): виртуально из client_plans в IndexedDB.
 * Непрочитанное = клиент ещё не открыл (нет client_seen_at). Не путать с чатом.
 */
import { clientNotificationsBadgeText, clientNotificationsEntryLabelRu } from '../client/clientNotificationsCore.js'

export const TRAINER_NOTIFICATIONS_PATH = '/trainer/notifications'
export const COACH_NOTIFICATIONS_PATH = '/coach/notifications'

export { clientNotificationsBadgeText as trainerNotificationsBadgeText, clientNotificationsEntryLabelRu as trainerNotificationsEntryLabelRu }

/**
 * @param {object[]} plans — строки client_plans (отметки или полные)
 * @param {Map<string, { name?: string }>|Record<string, { name?: string }>} clientsById
 */
export function buildTrainerNotificationsFromPlans(plans, clientsById = {}) {
  const get = (id) => (clientsById instanceof Map ? clientsById.get(id) : clientsById[id])
  const out = []
  for (const row of plans ?? []) {
    if (!row?.id || !row.sent_at) continue
    const kind = row.kind === 'nutrition' ? 'nutrition' : row.kind === 'homework' ? 'homework' : null
    if (!kind) continue
    const cid = String(row.client_id ?? '')
    const name = String(get(cid)?.name ?? '').trim() || 'Клиент'
    const first = name.split(/\s+/)[0] || name
    const what = kind === 'nutrition' ? 'рацион' : 'задание'
    const opened = Boolean(row.client_seen_at)
    out.push({
      id: String(row.id),
      kind: opened ? `${kind}_opened` : `${kind}_pending`,
      title: opened ? `${first} открыл(а) ${what}` : `Ждёт открытия · ${what}`,
      body: name,
      deep_link: `/trainer/clients/${encodeURIComponent(cid)}?tab=${kind === 'nutrition' ? 'nutrition' : 'homework'}`,
      created_at: String(opened ? row.client_seen_at : row.sent_at),
      read_at: opened ? String(row.client_seen_at) : null,
      client_id: cid,
    })
  }
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return out
}

export function trainerNotificationsUnreadCount(items) {
  return (items ?? []).reduce((n, it) => n + (it?.read_at ? 0 : 1), 0)
}
