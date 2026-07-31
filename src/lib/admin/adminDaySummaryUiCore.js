import { buildAdminClubQueryHref } from './adminClientQuickFilters.js'

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

  return [
    {
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
    {
      key: 'expired_recent',
      count: Number(summary.expired_recent) || 0,
      label: 'Закончился',
      hint: '0–13 дней после конца',
      icon: 'alert',
      to: clients('expired_recent'),
      hot: (Number(summary.expired_recent) || 0) > 0,
      warn: (Number(summary.expired_recent) || 0) > 0,
      textCount: false,
      valueSuffix: null,
    },
    {
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
    {
      key: 'expiring',
      count: summary.expiring,
      label: 'Истекает абонемент',
      hint: '≤ 3 дня',
      icon: 'clock',
      to: clients('expiring'),
      hot: summary.expiring > 0,
      warn: false,
      textCount: false,
      valueSuffix: null,
    },
    {
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
    {
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
    {
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
    {
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
  ]
}

/**
 * До maxSpotlight «горячих» + добивка спокойными; остальное — «ещё».
 *
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
