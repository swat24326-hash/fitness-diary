import { NavLink } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { inboxBadgeText } from '../../lib/client/clientInboxUiCore.js'
import { useStaffInboxCount } from '../../pages/staff/useStaffInbox.js'

/**
 * Конверт «Сообщения клуба» в шапке тренера / менеджера / управляющего.
 * chatsOnly — главный админ: рассылок ему не приходит, только переписка с сотрудниками.
 */
export function StaffInboxButton({ chatsOnly = false }) {
  const count = useStaffInboxCount(true, { chatsOnly })
  const badge = inboxBadgeText(count)
  const title = chatsOnly ? 'Сообщения сотрудников' : 'Сообщения клуба'
  const label = count ? `${title}: ${count} новых` : title
  return (
    <NavLink
      to={chatsOnly ? '/messages?tab=chats' : '/messages'}
      className={({ isActive }) =>
        `btn btn-secondary btn-sm app-header__inbox-btn${isActive ? ' app-header__inbox-btn--active' : ''}`
      }
      title={label}
      aria-label={label}
    >
      <Mail size={20} strokeWidth={2} aria-hidden />
      {badge ? (
        <span className="app-header__inbox-badge" aria-hidden>
          {badge}
        </span>
      ) : null}
    </NavLink>
  )
}
