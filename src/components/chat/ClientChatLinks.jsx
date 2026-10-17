import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { ClientInviteModal } from '../client/ClientInviteModal.jsx'
import { useAuth } from '../../context/AuthContext'
import { fetchClientAppStatus } from '../../lib/client/clientInviteService.js'
import { chatKindLabelRu, chatKindsForStaff } from '../../lib/chat/chatAccessCore.js'

/**
 * Конвертик в карточке клиента.
 * Есть вход в /me → переписка; нет → QR-приглашение (как тусклый в «Сообщениях»).
 */
export function ClientChatLinks({ client, disabled = false }) {
  const auth = useAuth()
  const [hasApp, setHasApp] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const kinds = chatKindsForStaff(auth).filter((k) => k !== 'trainer' || client?.trainer_id)

  useEffect(() => {
    if (!client?.id || disabled) {
      setHasApp(false)
      return undefined
    }
    let cancelled = false
    setHasApp(false)
    void fetchClientAppStatus(client.id).then((r) => {
      if (!cancelled) setHasApp(Boolean(r.has_app))
    })
    return () => {
      cancelled = true
    }
  }, [client?.id, disabled])

  if (!client?.id || !kinds.length) return null

  if (!hasApp) {
    return (
      <>
        <button
          type="button"
          className="btn btn-ghost btn-icon-square"
          aria-label="Сначала пригласите в приложение"
          title="Сначала пригласите в приложение"
          disabled={disabled}
          data-testid="client-chat-links"
          onClick={() => setInviteOpen(true)}
        >
          <Mail size={16} aria-hidden />
        </button>
        <ClientInviteModal open={inviteOpen} client={client} onClose={() => setInviteOpen(false)} />
      </>
    )
  }

  const one = kinds.length === 1
  return (
    <nav className="chat-card-links" aria-label="Написать клиенту" data-testid="client-chat-links">
      {kinds.map((k) => (
        <Link
          key={k}
          className="btn btn-ghost btn-icon-square u-no-decoration"
          to={`/messages/chat/${client.id}/${k}`}
          aria-label={one ? 'Написать клиенту' : `Написать клиенту · ${chatKindLabelRu(k)}`}
          title={one ? 'Написать клиенту' : chatKindLabelRu(k)}
        >
          <Mail size={16} aria-hidden />
        </Link>
      ))}
    </nav>
  )
}
