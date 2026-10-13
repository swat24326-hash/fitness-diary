import { useCallback } from 'react'
import { healStaffPush } from '../lib/push/pushSelfHeal.js'
import { fetchVapidPublicKey, saveTrainerPushSubscription } from '../lib/push/trainerPushService.js'
import { usePushSelfHeal } from './usePushSelfHeal.js'

/** Приложение зала: при открытии молча чиним подписку на уведомления этого устройства. */
export function useStaffPushSelfHeal(clubId, enabled) {
  const heal = useCallback(
    () =>
      healStaffPush({
        fetchPublicKey: fetchVapidPublicKey,
        save: (p) =>
          saveTrainerPushSubscription({ clubId, endpoint: p.endpoint, p256dh: p.p256dh, auth: p.auth, userAgent: p.user_agent }),
      }),
    [clubId],
  )
  usePushSelfHeal('staff', heal, enabled)
}
