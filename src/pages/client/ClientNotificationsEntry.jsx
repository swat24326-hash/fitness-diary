import { Link } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'
import {
  CLIENT_NOTIFICATIONS_PATH,
  buildClientNotificationsFromPlans,
  clientNotificationsEntryLabelRu,
  clientNotificationsUnreadCount,
} from '../../lib/client/clientNotificationsCore.js'

/** Компактный вход на главной /me → лента. Точка = тот же unread, что «Новое» на «От тренера». */
export function ClientNotificationsEntry({ plans }) {
  const unread = clientNotificationsUnreadCount(buildClientNotificationsFromPlans(plans))
  const label = clientNotificationsEntryLabelRu(unread)
  return (
    <Link to={CLIENT_NOTIFICATIONS_PATH} className="client-notif-entry" aria-label={label}>
      <span className="client-notif-entry__icon" aria-hidden>
        <Bell size={18} />
      </span>
      <span className="client-notif-entry__label">Уведомления</span>
      {unread > 0 ? <span className="client-plan-tab__dot" aria-hidden /> : null}
      <ChevronRight size={18} className="client-notif-entry__go" aria-hidden />
    </Link>
  )
}
