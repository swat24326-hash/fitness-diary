import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clientHandoffPageUrl,
  handoffLaunchAction,
  handoffTokenFromSearch,
  reusableHandoff,
} from '../../lib/client/clientHandoffCore.js'
import { hasClientSession, postClientMe } from '../../lib/client/clientSession.js'

const SAVED_KEY = 'fd_client_handoff'

function readSaved() {
  try {
    return JSON.parse(window.sessionStorage.getItem(SAVED_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * iPhone, Safari, баннер установки на экране: берём одноразовый вход для значка и кладём его в адрес
 * страницы (manifest подхватывает токен в ClientMeShell). Без сети — значок откроется без входа, как раньше.
 * @returns {string} токен или ''
 */
export function useClientHandoff({ active }) {
  const [token, setToken] = useState('')

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const apply = (t) => {
      if (cancelled) return
      setToken(t)
      if (window.location.pathname === '/me') window.history.replaceState(window.history.state, '', clientHandoffPageUrl(t))
    }
    const saved = reusableHandoff(readSaved())
    if (saved) apply(saved)
    else {
      postClientMe({ action: 'handoff' })
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
    }
  }, [active])

  return token
}

/** Запуск значка с /me?h=…: входим по приглашению или просто чистим адрес. */
export function useClientHandoffLaunch({ standalone }) {
  const navigate = useNavigate()
  useEffect(() => {
    const token = handoffTokenFromSearch(window.location.search)
    const action = handoffLaunchAction({ standalone, hasSession: hasClientSession(), token })
    if (action === 'redeem') navigate(`/me/join#t=${token}`, { replace: true })
    else if (action === 'strip') window.history.replaceState(window.history.state, '', '/me')
  }, [standalone, navigate])
}
