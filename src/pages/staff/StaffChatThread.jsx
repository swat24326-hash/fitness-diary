import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { StaffChatPane } from '../../components/chat/StaffChatPane.jsx'
import { staffClientChatKey } from '../../lib/chat/clientAzChatCore.js'
import { useAuth } from '../../context/AuthContext'

/**
 * /messages/chat/:clientId/:kind[/:peerUserId] — админ попадает сюда из карточки клиента.
 * У остальных (и ссылки из уведомлений) — панель справа в «Сообщениях клуба».
 */
export function StaffChatThread() {
  const { clientId = '', kind = '', peerUserId = '' } = useParams()
  const peer = String(peerUserId ?? '').trim() || null
  const { isAdmin } = useAuth()
  const chatKey = staffClientChatKey({ clientId, kind, peerUserId: peer })
  if (!isAdmin) return <Navigate to={`/messages?chat=${encodeURIComponent(chatKey)}`} replace />
  const back = `/admin/clients/${clientId}`
  return (
    <div className="staff-inbox">
      <StaffChatPane
        key={chatKey}
        clientId={clientId}
        kind={kind}
        peerUserId={peer}
        backTo={back}
        back={
          <Link
            to={back}
            replace
            className="btn btn-ghost btn-icon-square btn-touch"
            aria-label="Карточка клиента"
            title="Карточка клиента"
          >
            <ArrowLeft size={20} aria-hidden />
          </Link>
        }
      />
    </div>
  )
}
