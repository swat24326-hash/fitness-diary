import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { StaffChatPane } from '../../components/chat/StaffChatPane.jsx'
import { useAuth } from '../../context/AuthContext'

/**
 * /messages/chat/:clientId/:kind — админ попадает сюда из карточки клиента.
 * У остальных (и ссылки из уведомлений) — панель справа в «Сообщениях клуба».
 */
export function StaffChatThread() {
  const { clientId = '', kind = '' } = useParams()
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to={`/messages?chat=${encodeURIComponent(`${clientId}:${kind}`)}`} replace />
  const back = `/admin/clients/${clientId}`
  return (
    <div className="staff-inbox">
      <StaffChatPane
        key={`${clientId}:${kind}`}
        clientId={clientId}
        kind={kind}
        backTo={back}
        back={
          <Link to={back} className="btn btn-ghost btn-sm staff-inbox__back">
            <ArrowLeft size={18} aria-hidden />
            Карточка клиента
          </Link>
        }
      />
    </div>
  )
}
