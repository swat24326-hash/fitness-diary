import { useLocation, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Compass,
  Gift,
  LayoutDashboard,
  Phone,
  Tags,
  Ticket,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react'

const SALES_HOME_TABS = new Set(['report', 'stats', 'analytics', 'strategy', 'price', 'clips'])

/**
 * Активные пункты шапки менеджера (те же маршруты, что плитки на /sales).
 */
export function useSalesHeaderNavActive() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const path = location.pathname
  const tab = String(searchParams.get('tab') ?? '').trim()

  return {
    home: path === '/sales' && !SALES_HOME_TABS.has(tab),
    clients: path.startsWith('/sales/clients'),
    calls: path.startsWith('/sales/call-log'),
    loyalty: path.startsWith('/sales/loyalty'),
    pnk: path.startsWith('/sales/pnk'),
    clips: path === '/sales' && tab === 'clips',
    planerka: path.startsWith('/sales/club-tasks'),
    report: path === '/sales' && tab === 'report',
    stats: path === '/sales' && tab === 'stats',
    analytics: path === '/sales' && tab === 'analytics',
    strategy: path === '/sales' && tab === 'strategy',
    price: path === '/sales' && tab === 'price',
  }
}

/**
 * Все разделы из плиток главной + «Главная», без дублей.
 * Короткие подписи в шапке; полный смысл — в title.
 */
export function salesHeaderNavItems(active) {
  return [
    { to: '/sales', end: true, label: 'Главная', title: 'Главная', icon: LayoutDashboard, isActive: active.home },
    { to: '/sales/clients', label: 'Клиенты', title: 'Клиенты', icon: Users, isActive: active.clients },
    { to: '/sales/call-log', label: 'Звонки', title: 'Журнал звонков', icon: Phone, isActive: active.calls },
    { to: '/sales/loyalty', label: 'Баллы', title: 'Журнал баллов', icon: Gift, isActive: active.loyalty },
    { to: '/sales/pnk', label: 'ПНК', title: 'ПНК — воронка пробных', icon: UserRound, isActive: active.pnk },
    { to: '/sales?tab=clips', label: 'Заявка', title: 'Заявка — клип тренеру', icon: Ticket, isActive: active.clips },
    { to: '/sales/club-tasks', label: 'Планёрка', title: 'Планёрка — задания клуба', icon: ClipboardList, isActive: active.planerka },
    { to: '/sales?tab=report', label: 'Отчёт', title: 'Отчёт — день и оплаты', icon: CalendarDays, isActive: active.report },
    { to: '/sales?tab=stats', label: 'Статистика', title: 'Статистика — месяц по залу', icon: BarChart3, isActive: active.stats },
    { to: '/sales?tab=analytics', label: 'Аналитика', title: 'Аналитика — динамика', icon: TrendingUp, isActive: active.analytics },
    { to: '/sales?tab=strategy', label: 'Стратегия', title: 'Стратегия — план и закрытия', icon: Compass, isActive: active.strategy },
    { to: '/sales?tab=price', label: 'Прайс', title: 'Прайс — ПЗ и ТЗ', icon: Tags, isActive: active.price },
  ]
}
