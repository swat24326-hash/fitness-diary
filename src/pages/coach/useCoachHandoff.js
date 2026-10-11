import { useEffect } from 'react'
import { handoffTokenFromSearch, reusableHandoff } from '../../lib/client/clientHandoffCore.js'
import { requestCoachHandoff } from '../../lib/coach/coachApiClient.js'

const SAVED_KEY = 'fd_coach_handoff'

function readSaved() {
  try {
    return JSON.parse(window.sessionStorage.getItem(SAVED_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * iPhone, Safari, подсказка установки на экране: одноразовый вход для значка — в адрес /coach?h=…,
 * его iPhone запомнит при «На экран Домой». Подсказку скрыли — убираем из адреса: скопированная ссылка
 * не впускает чужого. Без сети — значок откроется со входом по паролю или QR, как раньше.
 */
export function useCoachHandoff({ active }) {
  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const apply = (token) => {
      if (cancelled || window.location.pathname !== '/coach') return
      window.history.replaceState(window.history.state, '', `/coach?h=${token}`)
    }
    const saved = reusableHandoff(readSaved())
    if (saved) apply(saved)
    else {
      requestCoachHandoff()
        .then((r) => {
          if (!r?.token) return
          try {
            window.sessionStorage.setItem(SAVED_KEY, JSON.stringify({ token: r.token, expires_at: r.expires_at }))
          } catch {
            /* приватный режим — возьмём новый при следующем показе */
          }
          apply(r.token)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
      if (handoffTokenFromSearch(window.location.search)) {
        window.history.replaceState(window.history.state, '', window.location.pathname)
      }
    }
  }, [active])
}
