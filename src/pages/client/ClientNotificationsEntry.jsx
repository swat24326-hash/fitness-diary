import { NotificationsBellLink } from '../../components/notifications/NotificationsBellLink.jsx'
import {
  CLIENT_NOTIFICATIONS_PATH,
  buildClientNotifications,
  clientNotificationsUnreadCount,
} from '../../lib/client/clientNotificationsCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'

/** Колокольчик в шапке /me. */
export function ClientNotificationsEntry({ plans, ratings }) {
  const cached = readClientMeCache()?.data
  const unread = clientNotificationsUnreadCount(
    buildClientNotifications(plans ?? cached?.plans, ratings ?? cached?.ratings),
  )
  return <NotificationsBellLink to={CLIENT_NOTIFICATIONS_PATH} unread={unread} />
}
