import { NotificationsBellLink } from '../../components/notifications/NotificationsBellLink.jsx'
import { COACH_NOTIFICATIONS_PATH } from '../../lib/trainer/trainerNotificationsCore.js'

/** Колокольчик в шапке /coach — ведёт на единый блок настроек уведомлений. */
export function CoachNotificationsBell() {
  return <NotificationsBellLink to={COACH_NOTIFICATIONS_PATH} unread={0} />
}
