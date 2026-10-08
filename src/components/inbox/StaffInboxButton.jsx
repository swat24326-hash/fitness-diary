import { NavLink } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { inboxBadgeText } from '../../lib/client/clientInboxUiCore.js'
import { useStaffInboxCount } from '../../pages/staff/useStaffInbox.js'

/** Конверт «Сообщения клуба» в шапке тренера / менеджера / управляющего. */
export function StaffInboxButton() {
  const count = useStaffInboxCount(true)
  const badge = inboxBadgeText(count)
  const label = count ? `Сообщения клуба: ${count} новых` : 'Сообщения клуба'
  return (
    <NavLink
      to="/messages"
      className={({ isActive }) =>
        `btn btn-secondary btn-sm app-header__inbox-btn${isActive ? ' app-header__inbox-btn--active' : ''}`
      }
      title={label}
      aria-label={label}
    >
      <Mail size={20} aria-hidden />
      {badge ? (
        <span className="app-header__inbox-badge" aria-hidden>
          {badge}
        </span>
      ) : null}
    </NavLink>
  )
}
