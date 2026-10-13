import { useEffect } from 'react'
import { STAFF_ATTENTION_CHANGED, STAFF_INBOX_CHANGED } from '../lib/inbox/staffInboxApiClient.js'
import { onPushReceived } from '../lib/push/pushReceivedSignal.js'

/**
 * Мессенджер сотрудника перечитывает список вместе с конвертом в шапке: push, прочтение,
 * изменилось число на конверте (опрос, возврат в окно — когда push до компьютера не дошёл).
 * @param {() => void} reload
 */
export function useStaffMessengerRefresh(reload) {
  useEffect(() => {
    const offPush = onPushReceived(reload)
    window.addEventListener(STAFF_INBOX_CHANGED, reload)
    window.addEventListener(STAFF_ATTENTION_CHANGED, reload)
    return () => {
      offPush()
      window.removeEventListener(STAFF_INBOX_CHANGED, reload)
      window.removeEventListener(STAFF_ATTENTION_CHANGED, reload)
    }
  }, [reload])
}
