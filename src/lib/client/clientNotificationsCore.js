/**
 * Лента персональных уведомлений клиента (/me/notifications).
 * Фаза 1 — виртуальная: из сводки plans ответа /api/client-me (client_plans).
 * Прочитано = client_seen_at / seen у плана; отдельной таблицы нет.
 * Закладка kinds: rate_training, rate_membership — когда появится UI оценки → таблица.
 */
import { CLIENT_PLAN_ROUTES, clientHomeworkTitle, planFootRu } from './clientPlanUiCore.js'

export const CLIENT_NOTIFICATIONS_PATH = '/me/notifications'

/** Реальные kinds фазы 1 + закладки (ещё не собираются в ленту). */
export const CLIENT_NOTIFICATION_KINDS = Object.freeze({
  homework_sent: 'homework_sent',
  nutrition_sent: 'nutrition_sent',
  rate_training: 'rate_training',
  rate_membership: 'rate_membership',
})

const PLAN_KIND_TO_NOTIF = Object.freeze({
  homework: CLIENT_NOTIFICATION_KINDS.homework_sent,
  nutrition: CLIENT_NOTIFICATION_KINDS.nutrition_sent,
})

function homeworkBody(brief) {
  const title = clientHomeworkTitle(brief?.summary?.title)
  const n = Number(brief?.summary?.count) || 0
  return n > 0 ? `${title} · ${n}` : title
}

function nutritionBody(brief) {
  const kcal = Math.round(Number(brief?.summary?.kcal) || 0)
  return kcal > 0 ? `${kcal} ккал` : 'Рацион от тренера'
}

/**
 * Сводка plans → элементы ленты (новые сверху).
 * @returns {{ id: string, kind: string, title: string, body: string, deep_link: string, created_at: string, read_at: string|null }[]}
 */
export function buildClientNotificationsFromPlans(plans, { timeZone } = {}) {
  const out = []
  for (const planKind of ['homework', 'nutrition']) {
    const brief = plans?.[planKind]
    if (!brief?.id || !brief.sent_at) continue
    const kind = PLAN_KIND_TO_NOTIF[planKind]
    const foot = planFootRu(brief, timeZone)
    const body = planKind === 'nutrition' ? nutritionBody(brief) : homeworkBody(brief)
    out.push({
      id: String(brief.id),
      kind,
      title: planKind === 'nutrition' ? 'Рацион питания' : 'Новое задание',
      body: foot ? `${body} · ${foot}` : body,
      deep_link: CLIENT_PLAN_ROUTES[planKind],
      created_at: String(brief.sent_at),
      read_at: brief.seen ? String(brief.client_seen_at || brief.sent_at) : null,
    })
  }
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return out
}

export function clientNotificationsUnreadCount(items) {
  return (items ?? []).reduce((n, it) => n + (it?.read_at ? 0 : 1), 0)
}

/** Подпись колокольчика / aria. */
export function clientNotificationsEntryLabelRu(unread) {
  const n = Math.max(0, Number(unread) || 0)
  return n > 0 ? `Уведомления: новых ${n}` : 'Уведомления'
}

/** Число на колокольчике (как на «Сообщениях»). */
export function clientNotificationsBadgeText(count) {
  const n = Number(count) || 0
  if (n <= 0) return ''
  return n > 9 ? '9+' : String(n)
}
