import { NotificationsBellLink } from '../../components/notifications/NotificationsBellLink.jsx'
import { clientShowsFromTrainerTab } from '../../lib/chat/clientAzChatCore.js'
import {
  CLIENT_NOTIFICATIONS_PATH,
  clientNotificationsBellCount,
} from '../../lib/client/clientNotificationsCore.js'
import { liveHallsFromMembershipViews } from '../../lib/client/clientHomeHallCore.js'
import { readClientMeCache } from '../../lib/client/clientSession.js'

/** Колокольчик в шапке /me: ДЗ, рацион, оценки, абонемент и рассылки клуба. */
export function ClientNotificationsEntry({ plans, ratings, inboxAttention, membershipNotices }) {
  const cached = readClientMeCache()?.data
  const liveHalls = Array.isArray(cached?.memberships?.current)
    ? liveHallsFromMembershipViews(cached.memberships.current)
    : null
  const unread = clientNotificationsBellCount({
    plans: plans ?? cached?.plans,
    ratings: ratings ?? cached?.ratings,
    membershipNotices: membershipNotices ?? cached?.membership_notices,
    inboxAttention: inboxAttention ?? cached?.inbox_attention,
    includeFromTrainer: clientShowsFromTrainerTab(cached?.client, { liveHalls }),
  })
  return <NotificationsBellLink to={CLIENT_NOTIFICATIONS_PATH} unread={unread} />
}
