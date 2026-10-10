import { NavLink } from 'react-router-dom'
import { CalendarDays, MessageCircle, MoreHorizontal } from 'lucide-react'
import { OsMark } from '../../components/brand/OsMark.jsx'
import { PRODUCT_BRAND_NAME } from '../../lib/productBrand.js'
import { useClientBranding } from '../client/useClientBranding.js'

export const COACH_APP_TITLE = `${PRODUCT_BRAND_NAME} · тренер`
const COACH_MANIFEST = '/manifest-coach.json'

const TABS = [
  { to: '/coach', end: true, icon: CalendarDays, label: 'Сегодня' },
  { to: '/coach/chats', icon: MessageCircle, label: 'Сообщения' },
  { to: '/coach/more', icon: MoreHorizontal, label: 'Ещё' },
]

/** Телефон тренера: шапка, экран, нижние вкладки. tabs=false — вход и диалог (своя навигация). */
export function CoachShell({ children, title = COACH_APP_TITLE, actions = null, tabs = true }) {
  useClientBranding(COACH_APP_TITLE, COACH_MANIFEST)
  return (
    <div className={`coach-app${tabs ? ' coach-app--tabs' : ''}`}>
      <header className="coach-app__top">
        <span className="coach-app__brand">
          <OsMark size={18} />
          <span className="coach-app__title">{title}</span>
        </span>
        {actions}
      </header>
      <main className="coach-app__main">{children}</main>
      {tabs ? (
        <nav className="coach-tabs" aria-label="Разделы">
          {TABS.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `coach-tabs__tab${isActive ? ' is-active' : ''}`}>
              <Icon size={22} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
