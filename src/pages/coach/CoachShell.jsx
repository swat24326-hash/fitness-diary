import { NavLink } from 'react-router-dom'
import { CalendarDays, Menu, MessageCircle, Users } from 'lucide-react'
import { OsMark } from '../../components/brand/OsMark.jsx'
import { APP_BRAND_COACH_TITLE } from '../../lib/appBrand.js'
import { useClientBranding } from '../client/useClientBranding.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { useCoachAttention } from './useCoachAttention.js'
import { useCoachPushSelfHeal } from './useCoachPush.js'

export const COACH_APP_TITLE = APP_BRAND_COACH_TITLE
const COACH_MANIFEST = '/manifest-coach.json'

const TABS = [
  { to: '/coach', end: true, icon: CalendarDays, label: 'Ежедневник' },
  { to: '/coach/chats', icon: MessageCircle, label: 'Сообщения', attention: true },
  { to: '/coach/clients', icon: Users, label: 'Клиенты' },
]

function CoachTabs() {
  const attention = useCoachAttention()
  return (
    <nav className="coach-tabs" aria-label="Разделы">
      {TABS.map(({ to, end, icon: Icon, label, attention: withBadge }) => {
        const badge = withBadge && attention > 0 ? attention : 0
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `coach-tabs__tab${isActive ? ' is-active' : ''}`}
            aria-label={badge ? `${label}, новых диалогов: ${badge}` : label}
          >
            <span className="coach-tabs__icon">
              <Icon size={22} aria-hidden />
              {badge ? <span className="coach-tabs__badge" aria-hidden>{badge > 99 ? '99+' : badge}</span> : null}
            </span>
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

/**
 * Телефон тренера: шапка, экран, нижние вкладки. tabs=false — вход и диалог (своя навигация).
 * fill — экран ровно в высоту телефона, листается только содержимое (Ежедневник: сетка часов).
 * bar — вместо шапки приложения своя строка (диалог: ChatHeadBar, как в Telegram).
 */
export function CoachShell({ children, title = '', actions = null, tabs = true, fill = false, bar = null }) {
  const { club, signedIn } = useCoachApp()
  useCoachPushSelfHeal(signedIn)
  const clubTitle = club?.name || COACH_APP_TITLE
  useClientBranding(clubTitle, club?.manifest_url || COACH_MANIFEST)
  return (
    <div className={`coach-app${tabs ? ' coach-app--tabs' : ''}${fill ? ' coach-app--fill' : ''}`}>
      {bar ? <div className="coach-app__top coach-app__top--bar">{bar}</div> : <CoachTop title={title || clubTitle} actions={actions} menu={tabs} />}
      <main className="coach-app__main">{children}</main>
      {tabs ? <CoachTabs /> : null}
    </div>
  )
}

function CoachTop({ title, actions, menu }) {
  return (
    <header className="coach-app__top">
      <span className="coach-app__brand">
        <OsMark size={18} />
        <span className="coach-app__title">{title}</span>
      </span>
      <span className="coach-app__actions">
        {actions}
        {menu ? (
          <NavLink
            to="/coach/more"
            className={({ isActive }) => `btn btn-ghost btn-icon-square btn-touch coach-app__menu${isActive ? ' is-active' : ''}`}
            aria-label="Меню"
            title="Меню"
          >
            <Menu size={20} aria-hidden />
          </NavLink>
        ) : null}
      </span>
    </header>
  )
}
