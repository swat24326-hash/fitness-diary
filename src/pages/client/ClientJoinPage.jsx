import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CLIENT_OFFLINE_RU, hasClientSession, redeemClientInvite } from '../../lib/client/clientSession.js'
import { RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'

function tokenFromHash() {
  const params = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
  return String(params.get('t') ?? '').trim()
}

/** /me/join#t=… — гасим приглашение и переходим в /me. Токен сразу убираем из адресной строки. */
export function ClientJoinPage() {
  const navigate = useNavigate()
  const [token] = useState(tokenFromHash)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  const redeem = useCallback(() => {
    setBusy(true)
    setError('')
    redeemClientInvite(token)
      .then(() => navigate('/me', { replace: true }))
      .catch((e) => setError(e?.message || 'Не удалось войти'))
      .finally(() => setBusy(false))
  }, [token, navigate])

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    window.history.replaceState(null, '', '/me/join')
    redeem()
  }, [token, redeem])

  if (!token) return <Navigate to="/me" replace />

  return (
    <ClientMeShell>
      {error ? (
        <ClientMeStatus icon={error === CLIENT_OFFLINE_RU ? WifiOff : TriangleAlert} title="Не получилось войти" hint={error} alert>
          {error === CLIENT_OFFLINE_RU ? (
            <button type="button" className="btn btn-primary btn-touch" disabled={busy} onClick={redeem}>
              Повторить
            </button>
          ) : hasClientSession() ? (
            <button type="button" className="btn btn-primary btn-touch" onClick={() => navigate('/me', { replace: true })}>
              Открыть мои данные
            </button>
          ) : null}
        </ClientMeStatus>
      ) : (
        <ClientMeStatus icon={RefreshCw} spin title="Входим…" />
      )}
    </ClientMeShell>
  )
}
