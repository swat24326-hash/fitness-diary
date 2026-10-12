import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { logoutClient, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientMenu } from './ClientMenu.jsx'

/** Шапка вложенного экрана /me: меню, в нём «Обновить» (если экран умеет) — как на главной. */
export function ClientPageActions({ onRefresh = null, refreshing = false }) {
  const navigate = useNavigate()
  const name = readClientMeCache()?.data?.client?.name || ''
  return (
    <span className="client-me__actions">
      <ClientMenu
        clientName={name}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onLogout={() => void logoutClient().then(() => navigate('/me', { replace: true }))}
      />
    </span>
  )
}

/** Заголовок вложенного экрана: «Назад» слева от названия — одно место на всех экранах. Экран-вкладка — back={false}. */
export function ClientPageTitle({ title, to = '/me', back = true }) {
  const navigate = useNavigate()
  return (
    <div className="client-page-title">
      {back ? (
        <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={() => navigate(to)} title="Назад" aria-label="Назад">
          <ArrowLeft size={20} aria-hidden />
        </button>
      ) : null}
      <h1 className="client-me__hello">{title}</h1>
    </div>
  )
}
