import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { logoutClient, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientMenu } from './ClientMenu.jsx'

/** Шапка вложенного экрана /me: «Обновить» (если экран умеет) + меню — как на главной. */
export function ClientPageActions({ onRefresh = null, refreshing = false }) {
  const navigate = useNavigate()
  const name = readClientMeCache()?.data?.client?.name || ''
  return (
    <span className="client-me__actions">
      {onRefresh ? (
        <button
          type="button"
          className="btn btn-ghost btn-icon-square btn-touch"
          onClick={onRefresh}
          disabled={refreshing}
          title="Обновить"
          aria-label="Обновить"
        >
          <RefreshCw size={18} aria-hidden className={refreshing ? 'client-me-spin' : undefined} />
        </button>
      ) : null}
      <ClientMenu clientName={name} onLogout={() => void logoutClient().then(() => navigate('/me', { replace: true }))} />
    </span>
  )
}

/** Заголовок вложенного экрана: «Назад» слева от названия — одно место на всех экранах. */
export function ClientPageTitle({ title, to = '/me' }) {
  const navigate = useNavigate()
  return (
    <div className="client-page-title">
      <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={() => navigate(to)} title="Назад" aria-label="Назад">
        <ArrowLeft size={20} aria-hidden />
      </button>
      <h1 className="client-me__hello">{title}</h1>
    </div>
  )
}
