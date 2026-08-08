import { buildAdminClubQueryHref } from './adminClientQuickFilters.js'
import { MEMBERSHIP_EXPIRING_WITHIN_DAYS } from '../clientListSignals.js'

/** Секции сводки дня — как блоки фильтров в Клиентах. */
export const ADMIN_DAY_SUMMARY_GROUPS = [
  {
    id: 'base',
    title: 'База и поводы',
    keys: ['birthdays', 'trainings', 'coachQuality'],
  },
  {
    id: 'path',
    title: 'По абонементу',
    keys: ['expiring', 'expired_recent', 'stale', 'inactive', 'awaiting_start'],
  },
]

/**
 * Карточки сводки дня (без React) — для UI и spotlight.
 * Отчёт продаж на главной не показываем — смотрят в разделе «Продажи».
 * Воронка клиентов — ссылки в /admin/clients?filter=.
 *
 * @param {{
 *   summary: object,
 *   clubId?: string,
 *   coachQuality?: { scorePct?: number | null, chipLabel?: string | null, hot?: boolean } | null,
 *   coachQualityLoading?: boolean,
 * }} opts
 */
export function buildAdminDaySummaryCards(opts = {}) {
  const summary = opts.summary
  if (!summary) return []
  const clubId = String(opts.clubId ?? '').trim()
  const cq = opts.coachQuality ?? null
  const cqLoading = opts.coachQualityLoading === true
  const clients = (filter) => buildAdminClubQueryHref('/admin/clients', { clubId, filter })

  /** @type {Record<string, object>} */
  const byKey = {
    birthdays: {
      key: 'birthdays',
      count: Number(summary.birthdays) || 0,
      label: 'ДР сегодня',
      hint: 'поздравить от клуба',
      icon: 'cake',
      to: clients('birthdays'),
      hot: (Number(summary.birthdays) || 0) > 0,
      warn: false,
      textCount: false,
      valueSuffix: null,
    },
    trainings: {
      key: 'trainings',
      count: summary.trainingsToday,
      label: 'Тренировок сегодня',
      hint: `вчера: ${summary.trainingsYesterday}`,
      icon: 'barChart',
      to: buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'today', panel: 'journal' }),
      hot: false,
      warn: false,
      textCount: false,
      valueSuffix: null,
    },
    coachQuality: {
      key: 'coachQuality',
      count: cqLoading && !cq ? '…' : cq?.scorePct != null ? cq.scorePct : '—',
      label: 'Качество ведения',
      hint: cq?.chipLabel || 'за месяц · таблица в статистике',
      icon: 'gauge',
      to: buildAdminClubQueryHref('/admin/statistics', {
        clubId,
        period: 'month',
        panel: 'coachQuality',
      }),
      hot: Boolean(cq?.hot),
      warn: false,
      textCount: cq?.scorePct == null,
      valueSuffix: cq?.scorePct != null ? '/100' : null,
    },
    expiring: {
      key: 'expiring',
      count: summary.expiring,
      label: 'Истекает',
      hint: `≤ ${MEMBERSHIP_EXPIRING_WITHIN_DAYS} дней`,
      icon: 'clock',
      to: clients('expiring'),
      hot: summary.expiring > 0,
      warn: false,
      textCount: false,
      valueSuffix: null,
    },
    expired_recent: {
      key: 'expired_recent',
      count: Number(summary.expired_recent) || 0,
      label: 'Закончился',
      hint: '0–13 дн. или лимит 0',
      icon: 'alert',
      to: clients('expired_recent'),
      hot: (Number(summary.expired_recent) || 0) > 0,
      warn: (Number(summary.expired_recent) || 0) > 0,
      textCount: false,
      valueSuffix: null,
    },
    stale: {
      key: 'stale',
      count: Number(summary.stale) || 0,
      label: 'Давно не был',
      hint: '14–60 дней после конца',
      icon: 'history',
      to: clients('stale'),
      hot: (Number(summary.stale) || 0) > 0,
      warn: false,
      textCount: false,
      valueSuffix: null,
    },
    inactive: {
      key: 'inactive',
      count: summary.inactive,
      label: 'Не активные',
      hint: 'на сегодня · список в клиентах',
      icon: 'userX',
      to: clients('inactive'),
      hot: summary.inactive > 0,
      warn: false,
      textCount: false,
      valueSuffix: null,
    },
    awaiting_start: {
      key: 'awaiting_start',
      count: Number(summary.awaiting_start) || 0,
      label: 'Ждёт старт',
      hint: 'абонемент куплен вперёд',
      icon: 'calendarClock',
      to: clients('awaiting_start'),
      hot: false,
      warn: false,
      textCount: false,
      valueSuffix: null,
    },
  }

  return ADMIN_DAY_SUMMARY_GROUPS.flatMap((g) => g.keys.map((k) => byKey[k]).filter(Boolean))
}

/**
 * Карточки по секциям (порядок как в Клиентах).
 * @param {ReturnType<typeof buildAdminDaySummaryCards>} cards
 */
export function groupAdminDaySummaryCards(cards) {
  const list = Array.isArray(cards) ? cards : []
  const byKey = new Map(list.map((c) => [c.key, c]))
  return ADMIN_DAY_SUMMARY_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    cards: g.keys.map((k) => byKey.get(k)).filter(Boolean),
  })).filter((g) => g.cards.length > 0)
}

/**
 * До maxSpotlight «горячих» + добивка спокойными; остальное — «ещё».
 * @param {ReturnType<typeof buildAdminDaySummaryCards>} cards
 * @param {{ maxSpotlight?: number }} [opts]
 */
export function splitDaySummarySpotlight(cards, opts = {}) {
  const list = Array.isArray(cards) ? cards : []
  const maxSpotlight = Math.max(1, Number(opts.maxSpotlight) || 2)
  const urgent = list.filter((c) => c.hot || c.warn)
  const calm = list.filter((c) => !c.hot && !c.warn)

  /** @type {typeof list} */
  const spotlight = []
  const used = new Set()

  for (const c of urgent) {
    if (spotlight.length >= maxSpotlight) break
    spotlight.push(c)
    used.add(c.key)
  }
  for (const c of calm) {
    if (spotlight.length >= maxSpotlight) break
    if (used.has(c.key)) continue
    spotlight.push(c)
    used.add(c.key)
  }

  const rest = list.filter((c) => !used.has(c.key))
  return { spotlight, rest, hasMore: rest.length > 0 }
}
