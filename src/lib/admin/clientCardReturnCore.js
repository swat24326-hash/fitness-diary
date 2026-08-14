/**
 * Откуда открыли карточку клиента — «назад» ведёт туда, а не всегда в список.
 * Query: from=strategy|pnk|clips|…
 */

import { buildAdminClientsBackHref } from './adminClientsListHrefCore.js'

/** Допустимые источники (не путать с tab карточки health/diaries). */
export const CLIENT_CARD_FROM = Object.freeze({
  strategy: 'strategy',
  pnk: 'pnk',
  clips: 'clips',
  callToday: 'call-today',
})

/**
 * @param {unknown} raw
 * @returns {keyof typeof CLIENT_CARD_FROM | ''}
 */
export function normalizeClientCardFrom(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (v === CLIENT_CARD_FROM.strategy) return CLIENT_CARD_FROM.strategy
  if (v === CLIENT_CARD_FROM.pnk) return CLIENT_CARD_FROM.pnk
  if (v === CLIENT_CARD_FROM.clips) return CLIENT_CARD_FROM.clips
  if (v === CLIENT_CARD_FROM.callToday || v === 'call_today') return CLIENT_CARD_FROM.callToday
  return ''
}

/**
 * @param {{ forAdmin?: boolean, forSupervisor?: boolean, clubId?: string }} [opts]
 */
export function buildCallTodayReturnHref(opts = {}) {
  const clubId = String(opts.clubId ?? '').trim()
  if (opts.forSupervisor) return '/club'
  if (opts.forAdmin) {
    return clubId ? `/admin?club=${encodeURIComponent(clubId)}` : '/admin'
  }
  return '/sales'
}

/**
 * @param {{ forAdmin?: boolean, forSupervisor?: boolean, clubId?: string }} [opts]
 */
export function buildSalesStrategyReturnHref(opts = {}) {
  const clubId = String(opts.clubId ?? '').trim()
  if (opts.forSupervisor) return '/club/sales?tab=strategy'
  if (opts.forAdmin) {
    const qs = new URLSearchParams()
    if (clubId) qs.set('club', clubId)
    qs.set('tab', 'strategy')
    return `/admin/sales?${qs.toString()}`
  }
  return '/sales?tab=strategy'
}

/**
 * @param {{ forAdmin?: boolean, forSupervisor?: boolean, clubId?: string }} [opts]
 */
export function buildSalesPnkReturnHref(opts = {}) {
  const clubId = String(opts.clubId ?? '').trim()
  if (opts.forSupervisor) return '/club/pnk'
  if (opts.forAdmin) {
    return clubId ? `/admin/pnk?club=${encodeURIComponent(clubId)}` : '/admin/pnk'
  }
  return '/sales/pnk'
}

/**
 * @param {{ forAdmin?: boolean, forSupervisor?: boolean, clubId?: string }} [opts]
 */
export function buildSalesClipsReturnHref(opts = {}) {
  const clubId = String(opts.clubId ?? '').trim()
  if (opts.forSupervisor) return '/club/sales?tab=clips'
  if (opts.forAdmin) {
    const qs = new URLSearchParams()
    if (clubId) qs.set('club', clubId)
    qs.set('tab', 'clips')
    return `/admin/sales?${qs.toString()}`
  }
  return '/sales?tab=clips'
}

/**
 * @param {unknown} from
 */
export function clientCardBackLabel(from) {
  const f = normalizeClientCardFrom(from)
  if (f === CLIENT_CARD_FROM.strategy) return '← К стратегии'
  if (f === CLIENT_CARD_FROM.pnk) return '← К ПНК'
  if (f === CLIENT_CARD_FROM.clips) return '← К заявкам'
  if (f === CLIENT_CARD_FROM.callToday) return '← На главную'
  return '← К списку клиентов'
}

/**
 * Подпись крошки «родитель» карточки.
 * @param {unknown} from
 */
export function clientCardParentCrumbLabel(from) {
  const f = normalizeClientCardFrom(from)
  if (f === CLIENT_CARD_FROM.strategy) return 'Стратегия'
  if (f === CLIENT_CARD_FROM.pnk) return 'ПНК'
  if (f === CLIENT_CARD_FROM.clips) return 'Заявка тренеру'
  if (f === CLIENT_CARD_FROM.callToday) return 'Кому звонить'
  return 'Клиенты'
}

/**
 * @param {URLSearchParams | string | null | undefined} searchParams
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isSupervisor?: boolean }} role
 */
export function resolveClientCardBackHref(searchParams, role = {}) {
  let src
  if (searchParams instanceof URLSearchParams) src = searchParams
  else if (typeof searchParams === 'string') {
    src = new URLSearchParams(searchParams.startsWith('?') ? searchParams.slice(1) : searchParams)
  } else src = new URLSearchParams()

  const from = normalizeClientCardFrom(src.get('from'))
  const clubId = String(src.get('club') ?? '').trim()
  const forAdmin = Boolean(role.isAdmin)
  const forSupervisor = Boolean(role.isSupervisor)

  if (from === CLIENT_CARD_FROM.strategy) {
    return buildSalesStrategyReturnHref({ forAdmin, forSupervisor, clubId })
  }
  if (from === CLIENT_CARD_FROM.pnk) {
    return buildSalesPnkReturnHref({ forAdmin, forSupervisor, clubId })
  }
  if (from === CLIENT_CARD_FROM.clips) {
    return buildSalesClipsReturnHref({ forAdmin, forSupervisor, clubId })
  }
  if (from === CLIENT_CARD_FROM.callToday) {
    return buildCallTodayReturnHref({ forAdmin, forSupervisor, clubId })
  }

  if (role.isAdmin) {
    const withoutFrom = new URLSearchParams(src)
    withoutFrom.delete('from')
    return buildAdminClientsBackHref('/admin/clients', withoutFrom)
  }
  if (role.isSupervisor) {
    const withoutFrom = new URLSearchParams(src)
    withoutFrom.delete('from')
    withoutFrom.delete('club')
    return buildAdminClientsBackHref('/club/clients', withoutFrom)
  }
  if (role.isSalesManager) {
    const withoutClub = new URLSearchParams(src)
    withoutClub.delete('club')
    withoutClub.delete('from')
    return buildAdminClientsBackHref('/sales/clients', withoutClub)
  }
  return '/trainer/clients'
}
