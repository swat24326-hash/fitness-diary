import { NotificationsBellLink } from '../../components/notifications/NotificationsBellLink.jsx'
import {
  CLIENT_NOTIFICATIONS_PATH,
  clientNotificationsBellCount,
} from '../../lib/client/clientNotificationsCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'

/** Колокольчик в шапке /me: ДЗ, рацион, оценки и рассылки клуба. */
export function ClientNotificationsEntry({ plans, ratings, inboxAttention }) {
  const cached = readClientMeCache()?.data
  const unread = clientNotificationsBellCount({
    plans: plans ?? cached?.plans,
    ratings: ratings ?? cached?.ratings,
    inboxAttention: inboxAttention ?? cached?.inbox_attention,
  })
  return <NotificationsBellLink to={CLIENT_NOTIFICATIONS_PATH} unread={unread} />
}
