import { useEffect, useState } from 'react'
import { fetchCoachChats } from '../../lib/coach/coachApiClient.js'
import { onPushReceived } from '../../lib/push/pushReceivedSignal.js'

const POLL_MS = 60_000

/* Каждая вкладка монтирует свою оболочку — последнее число переживает переход, метка не мигает. */
let lastCount = 0

/**
 * Сколько диалогов ждут ответа — метка на вкладке «Сообщения»: при открытии, сразу при приходе push,
 * раз в минуту, пока приложение на экране, и при возврате в приложение. Ошибка сети оставляет прежнее число.
 */
export function useCoachAttention() {
  const [count, setCount] = useState(lastCount)
  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      fetchCoachChats()
        .then((r) => {
          lastCount = Number(r?.attention) || 0
          if (alive) setCount(lastCount)
        })
        .catch(() => {})
    }
    load()
    const t = window.setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    const offPush = onPushReceived(load)
    return () => {
      alive = false
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', load)
      offPush()
    }
  }, [])
  return count
}
