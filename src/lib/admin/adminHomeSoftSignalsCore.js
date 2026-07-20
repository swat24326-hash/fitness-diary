import { buildAdminClubQueryHref } from './adminClientQuickFilters.js'

/**
 * Мягкие сигналы для пустых слотов ряда «внимание» (когда нет ПНК / планёрки).
 * Отчёт продаж сюда не кладём — это зона менеджера в разделе «Продажи».
 *
 * @param {{
 *   summary?: {
 *     inactive?: number,
 *     expiring?: number,
 *     today?: string,
 *   } | null,
 *   coachQuality?: { scorePct?: number | null, chipLabel?: string | null, hot?: boolean } | null,
 *   clubId?: string,
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
 *   scorePct?: number | null,
 * }>}
 */
export function buildAdminHomeSoftSignals(opts = {}) {
  const summary = opts.summary ?? null
  const cq = opts.coachQuality ?? null
  const clubId = String(opts.clubId ?? '').trim()
  const out = []

  const hrefInactive =
    opts.hrefStatsInactive ||
    buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'today', panel: 'inactive' })
  const hrefCoach =
    opts.hrefStatsCoach ||
    buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'month', panel: 'coachQuality' })
  const hrefExpiring =
    opts.hrefClientsExpiring ||
    buildAdminClubQueryHref('/admin/clients', { clubId, filter: 'expiring' })

  const scorePct = cq?.scorePct != null && Number.isFinite(Number(cq.scorePct)) ? Number(cq.scorePct) : null
  if (cq && (scorePct != null || cq.hot || cq.chipLabel)) {
    out.push({
      id: 'coach-quality',
      title: 'Качество ведения',
      subtitle: cq.chipLabel || (cq.hot ? 'Нужен разбор' : 'за месяц · статистика'),
      href: hrefCoach,
      tone: cq.hot ? 'hot' : 'neutral',
      scorePct,
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
