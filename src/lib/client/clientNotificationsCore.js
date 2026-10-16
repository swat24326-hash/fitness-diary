/**
 * Лента уведомлений клиента (/me/notifications).
 * Планы (client_plans) + оценки (client_ratings) + рассылки клуба (inbox).
 * Без вкладок: одна лента, разные kinds.
 */
import { inboxItemMetaRu } from './clientInboxUiCore.js'
import { CLIENT_PLAN_ROUTES, clientHomeworkTitle, planFootRu } from './clientPlanUiCore.js'
import { CLIENT_RATING_KINDS } from './clientRatingCore.js'

export const CLIENT_NOTIFICATIONS_PATH = '/me/notifications'

export const CLIENT_NOTIFICATION_KINDS = Object.freeze({
  homework_sent: 'homework_sent',
  nutrition_sent: 'nutrition_sent',
  rate_membership: 'rate_membership',
  rate_homework: 'rate_homework',
  rate_nutrition: 'rate_nutrition',
  club_survey: 'club_survey',
  club_notice: 'club_notice',
})

const RATING_KIND_TO_NOTIF = Object.freeze({
  [CLIENT_RATING_KINDS.membership]: CLIENT_NOTIFICATION_KINDS.rate_membership,
  [CLIENT_RATING_KINDS.homework]: CLIENT_NOTIFICATION_KINDS.rate_homework,
  [CLIENT_RATING_KINDS.nutrition]: CLIENT_NOTIFICATION_KINDS.rate_nutrition,
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

/**
 * Сводка ratings из /api/client-me → элементы ленты.
 * @param {Array<{ id: string, kind: string, title: string, body: string, deep_link: string, created_at: string, read_at: string|null }>|null|undefined} ratings
 */
export function buildClientNotificationsFromRatings(ratings) {
  const out = []
  for (const r of ratings ?? []) {
    if (!r?.id || !r.created_at) continue
    const kind = RATING_KIND_TO_NOTIF[r.kind] ?? CLIENT_NOTIFICATION_KINDS.rate_membership
    out.push({
      id: `rating:${r.id}`,
      kind,
      title: r.title || 'Оцените прошедшие тренировки',
      body: r.body || '',
      deep_link: r.deep_link,
      created_at: String(r.created_at),
      read_at: r.read_at ? String(r.read_at) : null,
    })
  }
  return out
}

/**
 * Рассылки клуба (список my-inbox) → элементы ленты.
 * @param {Array<{ id: string, kind?: string, title?: string, sent_at?: string, attention?: boolean }>|null|undefined} inboxItems
 */
export function buildClientNotificationsFromInbox(inboxItems) {
  const out = []
  for (const it of inboxItems ?? []) {
    if (!it?.id || !it.sent_at) continue
    const survey = it.kind === 'survey'
    out.push({
      id: `inbox:${it.id}`,
      kind: survey ? CLIENT_NOTIFICATION_KINDS.club_survey : CLIENT_NOTIFICATION_KINDS.club_notice,
      title: String(it.title || (survey ? 'Опрос' : 'Объявление')).trim() || (survey ? 'Опрос' : 'Объявление'),
      body: inboxItemMetaRu(it),
      deep_link: `/me/inbox/${encodeURIComponent(String(it.id))}`,
      created_at: String(it.sent_at),
      read_at: it.attention ? null : String(it.sent_at),
    })
  }
  return out
}

/**
 * Планы + оценки + рассылки клуба, новые сверху.
 * @param {object} [opts]
 * @param {object[]} [opts.inboxItems]
 * @param {string} [opts.timeZone]
 */
export function buildClientNotifications(plans, ratings, opts = {}) {
  const items = [
    ...buildClientNotificationsFromPlans(plans, { timeZone: opts?.timeZone }),
    ...buildClientNotificationsFromRatings(ratings),
    ...buildClientNotificationsFromInbox(opts?.inboxItems),
  ]
  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return items
}

export function clientNotificationsUnreadCount(items) {
  return (items ?? []).reduce((n, it) => n + (it?.read_at ? 0 : 1), 0)
}

/**
 * Число на колокольчике: непрочитанные планы/оценки + inbox_attention с /api/client-me
 * (список рассылок может ещё не быть загружен).
 */
export function clientNotificationsBellCount({ plans, ratings, inboxAttention } = {}) {
  const personal = clientNotificationsUnreadCount(buildClientNotifications(plans, ratings))
  return personal + Math.max(0, Number(inboxAttention) || 0)
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
