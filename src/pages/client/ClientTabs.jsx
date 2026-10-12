import { NavLink } from 'react-router-dom'
import { House, ListChecks, MessageCircle } from 'lucide-react'
import { inboxBadgeText, inboxButtonLabelRu } from '../../lib/client/clientInboxUiCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'

const TABS = [
  { to: '/me', end: true, icon: House, label: 'Главная' },
  { to: '/me/trainings', icon: ListChecks, label: 'Тренировки' },
  { to: '/me/inbox', icon: MessageCircle, label: 'Сообщения', inbox: true },
]

/** Новые сообщения и непройденные опросы — из ответа /api/client-me. */
export function clientAttention(data) {
  return (Number(data?.inbox_attention) || 0) + (Number(data?.chat_attention) || 0)
}

/** Нижние вкладки /me — как у тренера. Число на «Сообщениях» — с последнего ответа сервера (или кэша). */
export function ClientTabs({ attention }) {
  const count = attention ?? clientAttention(readClientMeCache()?.data)
  return (
    <nav className="coach-tabs" aria-label="Разделы">
      {TABS.map(({ to, end, icon: Icon, label, inbox }) => {
        const badge = inbox ? inboxBadgeText(count) : ''
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `coach-tabs__tab${isActive ? ' is-active' : ''}`}
            aria-label={inbox ? inboxButtonLabelRu(count) : label}
          >
            <span className="coach-tabs__icon">
              <Icon size={22} aria-hidden />
              {badge ? (
                <span className="coach-tabs__badge" aria-hidden>
                  {badge}
                </span>
              ) : null}
            </span>
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
