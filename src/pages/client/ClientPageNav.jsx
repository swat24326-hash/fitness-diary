import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { logoutClient, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientMenu, ClientMenuItems } from './ClientMenu.jsx'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

function useClientMenuProps() {
  const navigate = useNavigate()
  return {
    clientName: readClientMeCache()?.data?.client?.name || '',
    onLogout: () => void logoutClient().then(() => navigate(CLIENT_HOME, { replace: true })),
  }
}

/** Шапка вложенного экрана /me: меню, в нём «Обновить» (если экран умеет) — как на главной. */
export function ClientPageActions({ onRefresh = null, refreshing = false }) {
  const menu = useClientMenuProps()
  return (
    <span className="client-me__actions">
      <ClientMenu {...menu} onRefresh={onRefresh} refreshing={refreshing} />
    </span>
  )
}

/** Те же пункты строками — для «⋮» в шапке диалога (одна кнопка справа, как в Telegram). */
export function ClientPageMenuItems({ onRefresh = null, refreshing = false }) {
  const menu = useClientMenuProps()
  return <ClientMenuItems {...menu} onRefresh={onRefresh} refreshing={refreshing} />
}

/** Заголовок вложенного экрана: «Назад» слева от названия — одно место на всех экранах. Экран-вкладка — back={false}. */
export function ClientPageTitle({ title, to = CLIENT_HOME, back = true }) {
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
