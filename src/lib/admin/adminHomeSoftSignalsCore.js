import { buildAdminClubQueryHref } from './adminClientQuickFilters.js'

/**
 * Мягкие сигналы для пустых слотов ряда «внимание» (когда нет ПНК / планёрки).
 *
 * @param {{
 *   summary?: {
 *     salesReportFilled?: boolean | null,
 *     inactive?: number,
 *     expiring?: number,
 *     today?: string,
 *   } | null,
 *   coachQuality?: { scorePct?: number | null, chipLabel?: string | null, hot?: boolean } | null,
 *   clubId?: string,
 *   hrefSales?: string,
 *   hrefStatsInactive?: string,
 *   hrefStatsCoach?: string,
 *   hrefClientsExpiring?: string,
 * }} opts
 * @returns {Array<{
 *   id: string,
 *   title: string,
 *   subtitle: string,
 *   href: string,
 *   tone: 'warn' | 'hot' | 'neutral',
 * }>}
 */
export function buildAdminHomeSoftSignals(opts = {}) {
  const summary = opts.summary ?? null
  const cq = opts.coachQuality ?? null
  const clubId = String(opts.clubId ?? '').trim()
  const out = []

  const hrefSales =
    opts.hrefSales || buildAdminClubQueryHref('/admin/sales', { clubId })
  const hrefInactive =
    opts.hrefStatsInactive ||
    buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'today', panel: 'inactive' })
  const hrefCoach =
    opts.hrefStatsCoach ||
    buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'month', panel: 'coachQuality' })
  const hrefExpiring =
    opts.hrefClientsExpiring ||
    buildAdminClubQueryHref('/admin/clients', { clubId, filter: 'expiring' })

  if (summary?.salesReportFilled === false) {
    out.push({
      id: 'sales-report',
      title: 'Отчёт продаж',
      subtitle: 'Не заполнен сегодня',
      href: hrefSales,
      tone: 'warn',
    })
  }

  if (cq?.hot) {
    const score = cq.scorePct != null ? `${cq.scorePct}/100` : ''
    out.push({
      id: 'coach-quality',
      title: 'Качество ведения',
      subtitle: cq.chipLabel || score || 'Нужен разбор',
      href: hrefCoach,
      tone: 'hot',
    })
  }

  const inactive = Number(summary?.inactive) || 0
  if (inactive > 0) {
    out.push({
      id: 'inactive',
      title: `${inactive} не активных`,
      subtitle: 'Список в статистике',
      href: hrefInactive,
      tone: 'hot',
    })
  }

  const expiring = Number(summary?.expiring) || 0
  if (expiring > 0) {
    out.push({
      id: 'expiring',
      title: expiring === 1 ? 'Истекает абонемент' : `${expiring} истекают`,
      subtitle: '≤ 3 дня',
      href: hrefExpiring,
      tone: 'warn',
    })
  }

  return out
}

/**
 * Сколько мягких сигналов показать в свободных слотах (макс. 2 боковых).
 * @param {unknown[]} signals
 * @param {{ primarySides?: number, maxSides?: number }} [opts]
 */
export function pickSoftSignalsForSlots(signals, opts = {}) {
  const primary = Math.max(0, Number(opts.primarySides) || 0)
  const maxSides = Math.max(0, Number(opts.maxSides) || 2)
  const free = Math.max(0, maxSides - primary)
  const list = Array.isArray(signals) ? signals : []
  return list.slice(0, free)
}
