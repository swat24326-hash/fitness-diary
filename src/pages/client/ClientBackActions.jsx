import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { logoutClient, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientMenu } from './ClientMenu.jsx'

/** Шапка вложенного экрана /me: «Назад» + меню. */
export function ClientBackActions({ to = '/me' }) {
  const navigate = useNavigate()
  const name = readClientMeCache()?.data?.client?.name || ''
  return (
    <span className="client-me__actions">
      <button type="button" className="btn btn-ghost btn-icon-square btn-touch" onClick={() => navigate(to)} title="Назад" aria-label="Назад">
        <ArrowLeft size={20} aria-hidden />
      </button>
      <ClientMenu clientName={name} onLogout={() => void logoutClient().then(() => navigate('/me', { replace: true }))} />
    </span>
  )
}
