import { useEffect, useState } from 'react'
import { fetchCoachChats } from '../../lib/coach/coachApiClient.js'

/** Сколько диалогов ждут ответа — метка на вкладке «Сообщения». Ошибка сети метку просто не показывает. */
export function useCoachAttention() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    fetchCoachChats()
      .then((r) => alive && setCount(Number(r?.attention) || 0))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return count
}
