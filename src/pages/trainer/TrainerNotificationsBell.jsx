import { NotificationsBellLink } from '../../components/notifications/NotificationsBellLink.jsx'
import { TRAINER_NOTIFICATIONS_PATH } from '../../lib/trainer/trainerNotificationsCore.js'
import { useTrainerNotifications } from './useTrainerNotifications.js'

/** Колокольчик в шапке планшета тренера. */
export function TrainerNotificationsBell() {
  const { unread } = useTrainerNotifications()
  return <NotificationsBellLink to={TRAINER_NOTIFICATIONS_PATH} unread={unread} />
}
