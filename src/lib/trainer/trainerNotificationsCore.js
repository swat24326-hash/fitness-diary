/**
 * Лента уведомлений тренера (планшет): виртуально из client_plans в IndexedDB.
 * Только то, что приложение отправило само: воскресное задание и рацион после пересчёта.
 * Текст — «Задание отправлено» / «Рацион отправлен». Кнопка «В приложение» и «прочитал» сюда не пишутся.
 * Красная точка гаснет, когда тренер открыл строку.
 */
import { clientNotificationsBadgeText, clientNotificationsEntryLabelRu } from '../client/clientNotificationsCore.js'
import { isHomeworkAutoPlanRow } from '../homework/auto/homeworkAutoPlanId.js'
import { isNutritionAutoPlanRow } from '../nutrition/nutritionAutoPlanId.js'

export const TRAINER_NOTIFICATIONS_PATH = '/trainer/notifications'
export const COACH_NOTIFICATIONS_PATH = '/coach/notifications'

export { clientNotificationsBadgeText as trainerNotificationsBadgeText, clientNotificationsEntryLabelRu as trainerNotificationsEntryLabelRu }

function clientName(clientsById, id) {
  const get = (cid) => (clientsById instanceof Map ? clientsById.get(cid) : clientsById[cid])
  return String(get(id)?.name ?? '').trim() || 'Клиент'
}

const AUTO_TITLE = Object.freeze({
  homework: 'Задание отправлено',
  nutrition: 'Рацион отправлен',
})

function isAutoPlanRow(row) {
  return isHomeworkAutoPlanRow(row) || isNutritionAutoPlanRow(row)
}

/**
 * @param {object[]} plans — строки client_plans (отметки или полные)
 * @param {Map<string, { name?: string }>|Record<string, { name?: string }>} clientsById
 */
export function buildTrainerNotificationsFromPlans(plans, clientsById = {}) {
  /** Последняя авто-отправка на пару клиент+вид. Ручные «В приложение» не берём. */
  const latestByKey = new Map()

  for (const row of plans ?? []) {
    if (!row?.id || !row.sent_at || !isAutoPlanRow(row)) continue
    const kind = row.kind === 'nutrition' ? 'nutrition' : 'homework'
    const cid = String(row.client_id ?? '')
    const key = `${cid}:${kind}`
    const prev = latestByKey.get(key)
    if (!prev || String(row.sent_at) > String(prev.sent_at)) latestByKey.set(key, row)
  }

  const out = []
  for (const row of latestByKey.values()) {
    const kind = row.kind === 'nutrition' ? 'nutrition' : 'homework'
    const cid = String(row.client_id ?? '')
    out.push({
      id: String(row.id),
      kind: `${kind}_sent`,
      title: AUTO_TITLE[kind],
      body: clientName(clientsById, cid),
      created_at: String(row.sent_at),
      read_at: null,
      client_id: cid,
    })
  }

  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return out
}

/** Раньше отсюда брали клиентов без «прочитал», чтобы спросить has_app. Лента больше так не смотрит. */
export function trainerNotificationPendingClientIds() {
  return []
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
