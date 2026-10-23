import { useEffect, useState } from 'react'
import { fetchClientChats } from '../../lib/client/clientChatService.js'
import {
  clientChatAttentionEpoch,
  hasClientSession,
  writeClientChatAttention,
} from '../../lib/client/clientSession.js'
import { onPushReceived } from '../../lib/push/pushReceivedSignal.js'

const POLL_MS = 15_000

/**
 * Число на вкладке «Сообщения», пока приложение на экране.
 * Главная иначе держит старый ответ /me и зажигает единичку только при смене вкладки.
 * Push обновляет сразу; без push — проверка раз в 15 секунд. Ошибка сети оставляет прежнее число.
 * @returns {number | null} null — ещё не спрашивали, вкладка берёт число экрана или кэш
 */
export function useClientChatAttention() {
  const [count, setCount] = useState(null)
  useEffect(() => {
    if (!hasClientSession()) return undefined
    let alive = true
    let seq = 0
    const load = () => {
      if (!alive || document.visibilityState !== 'visible' || !hasClientSession()) return
      const id = ++seq
      const epoch = clientChatAttentionEpoch()
      fetchClientChats()
        .then(({ attention }) => {
          if (!alive || id !== seq || epoch !== clientChatAttentionEpoch()) return
          const next = Math.max(0, Number(attention) || 0)
          writeClientChatAttention(next)
          setCount(next)
        })
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    const offPush = onPushReceived(load)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
      offPush()
    }
  }, [])
  return count
}
