import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { chatKindLabelRu, chatKindsForStaff } from '../../lib/chat/chatAccessCore.js'

/** «Переписка» в карточке клиента: диалоги, которые эта роль видит. Доступ всё равно проверяет сервер. */
export function ClientChatLinks({ client }) {
  const auth = useAuth()
  const kinds = chatKindsForStaff(auth).filter((k) => k !== 'trainer' || client?.trainer_id)
  if (!client?.id || !kinds.length) return null
  return (
    <nav className="chat-card-links" aria-label="Переписка с клиентом" data-testid="client-chat-links">
      <MessageCircle size={18} aria-hidden />
      <span className="muted">Переписка:</span>
      {kinds.map((k) => (
        <Link key={k} className="btn btn-secondary btn-sm btn-touch" to={`/messages/chat/${client.id}/${k}`}>
          {chatKindLabelRu(k)}
        </Link>
      ))}
    </nav>
  )
}
