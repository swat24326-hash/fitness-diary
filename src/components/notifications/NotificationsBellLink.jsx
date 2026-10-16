import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import {
  clientNotificationsBadgeText,
  clientNotificationsEntryLabelRu,
} from '../../lib/client/clientNotificationsCore.js'

/** Колокольчик в шапке: серый; при unread — accent и счётчик. Общий для /me, планшета и /coach. */
export function NotificationsBellLink({ to, unread = 0, className = '' }) {
  const n = Math.max(0, Number(unread) || 0)
  const badge = clientNotificationsBadgeText(n)
  const label = clientNotificationsEntryLabelRu(n)
  const live = n > 0
  return (
    <Link
      to={to}
      className={`btn btn-ghost btn-icon-square btn-touch client-notif-bell${live ? ' client-notif-bell--live' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
    >
      <Bell size={20} aria-hidden />
      {badge ? (
        <span className="client-notif-bell__badge" aria-hidden>
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
