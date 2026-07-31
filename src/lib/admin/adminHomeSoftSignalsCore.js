import { buildAdminClubQueryHref } from './adminClientQuickFilters.js'

/**
 * Мягкие сигналы для пустых слотов ряда «внимание» (когда нет ПНК / планёрки).
 * Отчёт продаж сюда не кладём — это зона менеджера в разделе «Продажи».
 *
 * @param {{
 *   summary?: {
 *     inactive?: number,
 *     expiring?: number,
 *     expired_recent?: number,
 *     stale?: number,
 *     birthdays?: number,
 *     awaiting_start?: number,
 *     today?: string,
 *   } | null,
 *   coachQuality?: {
 *     scorePct?: number | null,
 *     chipLabel?: string | null,
 *     hot?: boolean,
 *     reviewCount?: number,
 *     attentionCount?: number,
 *     droppedCount?: number,
 *   } | null,
 *   clubId?: string,
 *   hrefClientsInactive?: string,
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
 *   reviewCount?: number,
 *   attentionCount?: number,
 *   droppedCount?: number,
 * }>}
 */
export function buildAdminHomeSoftSignals(opts = {}) {
  const summary = opts.summary ?? null
  const cq = opts.coachQuality ?? null
  const clubId = String(opts.clubId ?? '').trim()
  const out = []
  const clients = (filter) => buildAdminClubQueryHref('/admin/clients', { clubId, filter })

  const hrefInactive =
    opts.hrefClientsInactive || opts.hrefStatsInactive || clients('inactive')
  const hrefCoach =
    opts.hrefStatsCoach ||
    buildAdminClubQueryHref('/admin/statistics', { clubId, period: 'month', panel: 'coachQuality' })
  const hrefExpiring = opts.hrefClientsExpiring || clients('expiring')

  const scorePct = cq?.scorePct != null && Number.isFinite(Number(cq.scorePct)) ? Number(cq.scorePct) : null
  if (cq && (scorePct != null || cq.hot || cq.chipLabel)) {
    const chipLabel = cq.chipLabel ? String(cq.chipLabel).trim() : ''
    out.push({
      id: 'coach-quality',
      title: 'Качество ведения',
      subtitle: chipLabel || (cq.hot ? 'Нужен разбор' : 'за месяц · статистика'),
      href: hrefCoach,
      tone: cq.hot ? 'hot' : 'neutral',
      scorePct,
      chipLabel: chipLabel || null,
      reviewCount: Math.max(0, Number(cq.reviewCount) || 0),
      attentionCount: Math.max(0, Number(cq.attentionCount) || 0),
      droppedCount: Math.max(0, Number(cq.droppedCount) || 0),
    })
  }

  const inactive = Number(summary?.inactive) || 0
  if (inactive > 0) {
    out.push({
      id: 'inactive',
      title: `${inactive} не активных`,
      subtitle: 'Список в клиентах',
      href: hrefInactive,
      tone: 'hot',
    })
  }

  const expiredRecent = Number(summary?.expired_recent) || 0
  if (expiredRecent > 0) {
    out.push({
      id: 'expired_recent',
      title: expiredRecent === 1 ? 'Абонемент закончился' : `${expiredRecent} закончились`,
      subtitle: '0–13 дней · продлить',
      href: clients('expired_recent'),
      tone: 'warn',
    })
  }

  const stale = Number(summary?.stale) || 0
  if (stale > 0) {
    out.push({
      id: 'stale',
      title: stale === 1 ? 'Давно не был' : `${stale} давно не были`,
      subtitle: '14–60 дней · возврат',
      href: clients('stale'),
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

  const birthdays = Number(summary?.birthdays) || 0
  if (birthdays > 0) {
    out.push({
      id: 'birthdays',
      title: birthdays === 1 ? 'ДР сегодня' : `${birthdays} ДР сегодня`,
      subtitle: 'SMS от клуба',
      href: clients('birthdays'),
      tone: 'neutral',
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

/**
 * Стабильные soft-слоты: CQ всегда только в planerka-soft (не в pnk).
 * Иначе при появлении ПНК карточка «переезжает» — выглядит как дёрганье.
 *
 * @param {unknown[]} signals
 * @param {{ hasPnk?: boolean, hasPlanerka?: boolean }} [opts]
 * @returns {{ softForPnk: object|null, softForPlanerka: object|null }}
 */
export function assignAttentionSoftSlots(signals, opts = {}) {
  const hasPnk = Boolean(opts.hasPnk)
  const hasPlanerka = Boolean(opts.hasPlanerka)
  const list = Array.isArray(signals) ? signals : []
  const cq = list.find((s) => s && s.id === 'coach-quality') ?? null
  const others = list.filter((s) => s && s.id !== 'coach-quality')

  let softForPnk = null
  let softForPlanerka = null

  // CQ: фиксированный «дом» — слот планёрки. Если планёрка занята — CQ только в сводке дня.
  if (cq && !hasPlanerka) {
    softForPlanerka = cq
  }

  const free = []
  if (!hasPnk) free.push('pnk')
  if (!hasPlanerka && !softForPlanerka) free.push('planerka')

  let i = 0
  for (const slot of free) {
    if (i >= others.length) break
    if (slot === 'pnk') softForPnk = others[i++]
    else softForPlanerka = others[i++]
  }

  return { softForPnk, softForPlanerka }
}
