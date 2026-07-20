import { buildAdminClubQueryHref } from './adminClientQuickFilters.js'

/**
 * Карточки сводки дня (без React) — для UI и spotlight.
 * Отчёт продаж на главной не показываем — смотрят в разделе «Продажи».
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

  return [
    {
      key: 'inactive',
      count: summary.inactive,
      label: 'Не активные',
      hint: 'на сегодня · список в статистике',
      icon: 'userX',
      to: buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'today', panel: 'inactive' }),
      hot: summary.inactive > 0,
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
      to: buildAdminClubQueryHref('/admin/clients', { clubId, filter: 'expiring' }),
      hot: summary.expiring > 0,
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
