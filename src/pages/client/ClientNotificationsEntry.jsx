import { NotificationsBellLink } from '../../components/notifications/NotificationsBellLink.jsx'
import {
  CLIENT_NOTIFICATIONS_PATH,
  buildClientNotificationsFromPlans,
  clientNotificationsUnreadCount,
} from '../../lib/client/clientNotificationsCore.js'

/** Колокольчик в шапке /me. */
export function ClientNotificationsEntry({ plans }) {
  const unread = clientNotificationsUnreadCount(buildClientNotificationsFromPlans(plans))
  return <NotificationsBellLink to={CLIENT_NOTIFICATIONS_PATH} unread={unread} />
}
