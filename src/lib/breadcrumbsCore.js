/**
 * Чистая сборка хлебных крошек по pathname + search (без React).
 * @typedef {{ label: string, to: string }} Crumb
 */

import {
  clientCardParentCrumbLabel,
  normalizeClientCardFrom,
  resolveClientCardBackHref,
} from './admin/clientCardReturnCore.js'

/** @param {string} [search] */
export function adminClubQs(search) {
  try {
    const x = new URLSearchParams(search ?? '').get('club')
    return x ? `?club=${encodeURIComponent(x)}` : ''
  } catch {
    return ''
  }
}

function tabFromSearch(search, fallback = '') {
  try {
    return new URLSearchParams(search ?? '').get('tab') ?? fallback
  } catch {
    return fallback
  }
}

/** Вкладки «Структура» — синхронно с AdminStructure.TABS */
export const STRUCTURE_TAB_LABELS = {
  clubs: 'Клубы',
  trainers: 'Тренеры',
  'sales-managers': 'Менеджеры',
  supervisors: 'Управляющие',
  'membership-types': 'Типы абон.',
  'club-plan': 'План ЗП',
  'nutrition-products': 'Питание',
  'homework-presets': 'ДЗ',
  exercises: 'Упражнения',
  'max-messages': 'Max и SMS',
  'coach-quality': 'Качество ведения',
  diagnostics: 'Диагностика',
  'iskra-settings': 'ИСКРА',
}

/** Вкладки `/admin/sales` — синхронно с AdminSales (admin) */
export const ADMIN_SALES_TAB_LABELS = {
  daily: 'Отчёт за день',
  clips: 'Заявка тренеру',
  stats: 'Статистика',
  strategy: 'Стратегия',
  plan: 'План месяца',
  finance: 'Финансы клуба',
  price: 'Прайс',
}

/** Вкладки `/sales` — синхронно с AdminSales (sales_manager), без home */
export const MANAGER_SALES_TAB_LABELS = {
  report: 'Отчёт за день',
  stats: 'Статистика',
  analytics: 'Аналитика',
  strategy: 'Стратегия',
  price: 'Прайс',
  clips: 'Заявка тренеру',
}

function matchPathSimple(pattern, pathname) {
  const pParts = pattern.split('/').filter(Boolean)
  const aParts = String(pathname || '/').split('/').filter(Boolean)
  if (pParts.length !== aParts.length) return null
  const params = {}
  for (let i = 0; i < pParts.length; i++) {
    const pp = pParts[i]
    const ap = aParts[i]
    if (pp.startsWith(':')) params[pp.slice(1)] = ap
    else if (pp !== ap) return null
  }
  return params
}

/**
 * @param {string} pathname
 * @param {string} [search]
 * @returns {Crumb[]}
 */
export function buildBreadcrumbs(pathname, search = '') {
  const p = pathname || '/'
  const clubQs = adminClubQs(search)
  const full = `${p}${search || ''}`

  const admin = [{ label: 'Админка', to: `/admin${clubQs}` }]
  const trainer = [{ label: 'Главная', to: '/trainer' }]
  const salesRoot = [{ label: 'План продаж', to: '/sales' }]

  if (p === '/' || p === '/trainer') return trainer

  // Trainer
  if (p === '/trainer/clients') return [...trainer, { label: 'Клиенты', to: '/trainer/clients' }]
  if (p === '/trainer/profile') return [...trainer, { label: 'Профиль', to: '/trainer/profile' }]
  if (matchPathSimple('/trainer/clients/:id', p)) {
    return [...trainer, { label: 'Клиенты', to: '/trainer/clients' }, { label: 'Карточка', to: p }]
  }
  if (matchPathSimple('/trainer/workouts/:id', p)) {
    return [...trainer, { label: 'Клиенты', to: '/trainer/clients' }, { label: 'Тренировка', to: p }]
  }
  if (matchPathSimple('/trainer/challenges/:challengeId', p)) {
    return [...trainer, { label: 'Челлендж', to: full }]
  }

  // Admin
  if (p === '/admin') return []

  if (p === '/admin/structure') {
    const tab = tabFromSearch(search, 'clubs')
    const sub = STRUCTURE_TAB_LABELS[tab] ?? 'Клубы'
    return [...admin, { label: 'Структура', to: `/admin/structure${clubQs}` }, { label: sub, to: full }]
  }

  if (p === '/admin/sales') {
    const tabRaw = tabFromSearch(search, 'daily')
    const tab = ADMIN_SALES_TAB_LABELS[tabRaw] ? tabRaw : 'daily'
    const sub = ADMIN_SALES_TAB_LABELS[tab]
    return [...admin, { label: 'Продажи', to: `/admin/sales${clubQs}` }, { label: sub, to: full }]
  }

  if (p === '/admin/clients') return [...admin, { label: 'Клиенты', to: `/admin/clients${clubQs}` }]
  if (p === '/admin/excel-lists') return [...admin, { label: 'Списки из Excel', to: `/admin/excel-lists${clubQs}` }]
  if (p === '/admin/statistics') return [...admin, { label: 'Статистика', to: `/admin/statistics${clubQs}` }]
  if (p === '/admin/challenges') return [...admin, { label: 'Челленджи', to: `/admin/challenges${clubQs}` }]
  if (p === '/admin/club-tasks') return [...admin, { label: 'Планёрка', to: `/admin/club-tasks${clubQs}` }]
  if (p === '/admin/pnk') return [...admin, { label: 'ПНК', to: `/admin/pnk${clubQs}` }]

  if (matchPathSimple('/admin/challenges/:challengeId', p)) {
    return [...admin, { label: 'Челленджи', to: `/admin/challenges${clubQs}` }, { label: 'Рейтинг', to: full }]
  }
  if (matchPathSimple('/admin/clients/:id', p)) {
    const from = normalizeClientCardFrom(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('from'))
    const backTo = resolveClientCardBackHref(search, { isAdmin: true })
    const parentLabel = clientCardParentCrumbLabel(from)
    return [...admin, { label: parentLabel, to: backTo }, { label: 'Карточка клиента', to: full }]
  }
  if (matchPathSimple('/admin/workouts/:id', p)) {
    return [...admin, { label: 'Клиенты', to: `/admin/clients${clubQs}` }, { label: 'Тренировка', to: full }]
  }

  // Club supervisor (/club)
  const clubRoot = [{ label: 'Клуб', to: '/club' }]
  if (p === '/club') return []
  if (p === '/club/clients') return [...clubRoot, { label: 'Клиенты', to: '/club/clients' }]
  if (p === '/club/statistics') return [...clubRoot, { label: 'Статистика', to: '/club/statistics' }]
  if (p === '/club/sales') {
    const tabRaw = tabFromSearch(search, 'daily')
    const tab = ADMIN_SALES_TAB_LABELS[tabRaw] ? tabRaw : 'daily'
    const sub = ADMIN_SALES_TAB_LABELS[tab]
    return [...clubRoot, { label: 'Продажи', to: '/club/sales' }, { label: sub, to: full }]
  }
  if (p === '/club/pnk') return [...clubRoot, { label: 'ПНК', to: '/club/pnk' }]
  if (p === '/club/challenges') return [...clubRoot, { label: 'Челленджи', to: '/club/challenges' }]
  if (p === '/club/club-tasks') return [...clubRoot, { label: 'Планёрка', to: '/club/club-tasks' }]
  if (p === '/club/settings') return [...clubRoot, { label: 'Настройки', to: '/club/settings' }]
  if (matchPathSimple('/club/challenges/:challengeId', p)) {
    return [...clubRoot, { label: 'Челленджи', to: '/club/challenges' }, { label: 'Рейтинг', to: full }]
  }
  if (matchPathSimple('/club/clients/:id', p)) {
    const from = normalizeClientCardFrom(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('from'))
    const backTo = resolveClientCardBackHref(search, { isSupervisor: true })
    const parentLabel = clientCardParentCrumbLabel(from)
    return [...clubRoot, { label: parentLabel, to: backTo }, { label: 'Карточка клиента', to: full }]
  }
  if (matchPathSimple('/club/workouts/:id', p)) {
    return [...clubRoot, { label: 'Клиенты', to: '/club/clients' }, { label: 'Тренировка', to: full }]
  }

  // Sales manager
  if (p === '/sales') {
    const tabRaw = tabFromSearch(search, 'home')
    if (!tabRaw || tabRaw === 'home') return salesRoot
    const sub = MANAGER_SALES_TAB_LABELS[tabRaw]
    if (!sub) return salesRoot
    return [...salesRoot, { label: sub, to: full }]
  }
  if (p === '/sales/club-tasks') return [...salesRoot, { label: 'Планёрка', to: '/sales/club-tasks' }]
  if (p === '/sales/pnk') return [...salesRoot, { label: 'ПНК', to: '/sales/pnk' }]
  if (p === '/sales/clients') return [...salesRoot, { label: 'Клиенты', to: '/sales/clients' }]
  if (matchPathSimple('/sales/clients/:id', p)) {
    const from = normalizeClientCardFrom(new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('from'))
    const backTo = resolveClientCardBackHref(search, { isSalesManager: true })
    const parentLabel = clientCardParentCrumbLabel(from)
    return [...salesRoot, { label: parentLabel, to: backTo }, { label: 'Карточка клиента', to: full }]
  }

  // Fallback
  if (p.startsWith('/admin')) return admin
  if (p.startsWith('/club')) return clubRoot
  if (p.startsWith('/sales')) return salesRoot
  if (p.startsWith('/trainer')) return trainer
  return [{ label: 'Главная', to: '/' }]
}
