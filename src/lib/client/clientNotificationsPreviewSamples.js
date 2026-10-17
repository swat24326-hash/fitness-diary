/**
 * Примеры всех клиентских уведомлений (лента + push) — только для локального превью.
 */
import { CLIENT_RATING_COPY } from './clientRatingCore.js'
import { CLIENT_NOTIFICATION_KINDS } from './clientNotificationsCore.js'
import {
  MEMBERSHIP_EXPIRING_NOTICE_TITLE,
  buildMembershipExpiringNoticeCopy,
} from './clientMembershipNoticeCore.js'

const PREVIEW_BASE = '/me/notifications-preview'
const NOW = '2026-10-17T10:05:00.000Z'
const HOUR = 3600_000

function at(hoursAgo) {
  return new Date(Date.parse(NOW) - hoursAgo * HOUR).toISOString()
}

function href(id) {
  return `${PREVIEW_BASE}/${encodeURIComponent(id)}`
}

/** @returns {Map<string, object>} */
export function clientNotificationsPreviewById() {
  const membership = buildMembershipExpiringNoticeCopy({ daysLeft: 5 })
  const items = [
    {
      id: 'membership',
      kind: CLIENT_NOTIFICATION_KINDS.membership_expiring,
      title: MEMBERSHIP_EXPIRING_NOTICE_TITLE,
      body: membership.body,
      deep_link: href('membership'),
      created_at: at(0.5),
      read_at: null,
      detail: {
        type: 'text',
        lead: membership.body,
        hint: 'В приложении тап сразу помечает прочитанным. Push: заголовок = имя клуба.',
      },
    },
    {
      id: 'homework',
      kind: CLIENT_NOTIFICATION_KINDS.homework_sent,
      title: 'Новое задание',
      body: 'Домашнее · 4 · сегодня',
      deep_link: href('homework'),
      created_at: at(2),
      read_at: null,
      detail: {
        type: 'plan',
        planKind: 'homework',
        lead: 'Пример экрана задания (превью без API).',
        lines: ['Приседания — 3×12', 'Планка — 3×40 с', 'Растяжка — 10 мин', 'Ходьба — 20 мин'],
      },
    },
    {
      id: 'nutrition',
      kind: CLIENT_NOTIFICATION_KINDS.nutrition_sent,
      title: 'Рацион питания',
      body: '1850 ккал · вчера',
      deep_link: href('nutrition'),
      created_at: at(26),
      read_at: null,
      detail: {
        type: 'plan',
        planKind: 'nutrition',
        lead: 'Пример рациона (превью без API).',
        lines: ['Завтрак — овсянка · 420 ккал', 'Обед — курица и гречка · 650 ккал', 'Ужин — рыба и салат · 480 ккал', 'Перекус — творог · 300 ккал'],
      },
    },
    {
      id: 'rate-membership',
      kind: CLIENT_NOTIFICATION_KINDS.rate_membership,
      title: CLIENT_RATING_COPY.membership.title,
      body: CLIENT_RATING_COPY.membership.subtitle,
      deep_link: href('rate-membership'),
      created_at: at(4),
      read_at: null,
      detail: {
        type: 'rating',
        ratingKind: 'membership',
        copy: CLIENT_RATING_COPY.membership,
      },
    },
    {
      id: 'rate-homework',
      kind: CLIENT_NOTIFICATION_KINDS.rate_homework,
      title: CLIENT_RATING_COPY.homework.title,
      body: CLIENT_RATING_COPY.homework.subtitle,
      deep_link: href('rate-homework'),
      created_at: at(5),
      read_at: null,
      detail: {
        type: 'rating',
        ratingKind: 'homework',
        copy: CLIENT_RATING_COPY.homework,
      },
    },
    {
      id: 'rate-nutrition',
      kind: CLIENT_NOTIFICATION_KINDS.rate_nutrition,
      title: CLIENT_RATING_COPY.nutrition.title,
      body: CLIENT_RATING_COPY.nutrition.subtitle,
      deep_link: href('rate-nutrition'),
      created_at: at(6),
      read_at: null,
      detail: {
        type: 'rating',
        ratingKind: 'nutrition',
        copy: CLIENT_RATING_COPY.nutrition,
      },
    },
    {
      id: 'survey',
      kind: CLIENT_NOTIFICATION_KINDS.club_survey,
      title: 'Как вам зал?',
      body: 'Опрос · +50 баллов',
      deep_link: href('survey'),
      created_at: at(8),
      read_at: null,
      detail: {
        type: 'survey',
        lead: 'Короткий опрос клуба (превью).',
        questions: ['Удобно ли записываться?', 'Чистота в зале?', 'Готовы рекомендовать друзьям?'],
        reward: '+50 баллов за ответ',
      },
    },
    {
      id: 'notice',
      kind: CLIENT_NOTIFICATION_KINDS.club_notice,
      title: 'График на праздники',
      body: 'Объявление',
      deep_link: href('notice'),
      created_at: at(30),
      read_at: at(28),
      detail: {
        type: 'text',
        lead: '1–3 января клуб закрыт. С 4 января работаем по обычному расписанию. Хороших праздников!',
        hint: 'Обычное объявление из рассылки клуба.',
      },
    },
    {
      id: 'push-reminder',
      kind: 'push_reminder',
      title: 'Fit City',
      body: 'Завтра в 10:00 — тренировка с Иваном',
      deep_link: href('push-reminder'),
      created_at: at(1),
      read_at: null,
      channel: 'Напоминание о тренировке (cron)',
      note: 'Заголовок — имя клуба; в ленту не кладётся',
      isPush: true,
      detail: {
        type: 'push',
        lead: 'Тап по push открывает главную клиента (/me).',
        hint: 'Это только push — отдельной строки в «Уведомлениях» нет.',
      },
    },
    {
      id: 'push-membership',
      kind: 'push_membership',
      title: 'Fit City',
      body: membership.body,
      deep_link: href('push-membership'),
      created_at: at(0.4),
      read_at: null,
      channel: 'Абонемент заканчивается (cron 10:00–12:00)',
      note: 'Заголовок — клуб; строка ещё и в ленте',
      isPush: true,
      detail: {
        type: 'push',
        lead: membership.body,
        hint: 'Тап → лента уведомлений; там же строка «Абонемент заканчивается».',
      },
    },
    {
      id: 'push-rate-membership',
      kind: 'push_rate',
      title: CLIENT_RATING_COPY.membership.title,
      body: CLIENT_RATING_COPY.membership.pushBody,
      deep_link: href('push-rate-membership'),
      created_at: at(3),
      read_at: null,
      channel: 'Оценка абонемента (push)',
      note: 'Открывает экран оценки',
      isPush: true,
      detail: {
        type: 'rating',
        ratingKind: 'membership',
        copy: CLIENT_RATING_COPY.membership,
      },
    },
    {
      id: 'push-rate-homework',
      kind: 'push_rate',
      title: CLIENT_RATING_COPY.homework.title,
      body: CLIENT_RATING_COPY.homework.pushBody,
      deep_link: href('push-rate-homework'),
      created_at: at(3.2),
      read_at: null,
      channel: 'Оценка задания (push)',
      note: '',
      isPush: true,
      detail: {
        type: 'rating',
        ratingKind: 'homework',
        copy: CLIENT_RATING_COPY.homework,
      },
    },
    {
      id: 'push-rate-nutrition',
      kind: 'push_rate',
      title: CLIENT_RATING_COPY.nutrition.title,
      body: CLIENT_RATING_COPY.nutrition.pushBody,
      deep_link: href('push-rate-nutrition'),
      created_at: at(3.4),
      read_at: null,
      channel: 'Оценка рациона (push)',
      note: '',
      isPush: true,
      detail: {
        type: 'rating',
        ratingKind: 'nutrition',
        copy: CLIENT_RATING_COPY.nutrition,
      },
    },
  ]
  return new Map(items.map((it) => [it.id, it]))
}

export function clientNotificationsFeedPreviewSamples() {
  return [...clientNotificationsPreviewById().values()].filter((it) => !it.isPush)
}

export function clientNotificationsPushPreviewSamples() {
  return [...clientNotificationsPreviewById().values()].filter((it) => it.isPush)
}

export function clientNotificationsPreviewSample(id) {
  return clientNotificationsPreviewById().get(String(id ?? '')) ?? null
}

export const CLIENT_NOTIFICATIONS_PREVIEW_PATH = PREVIEW_BASE
