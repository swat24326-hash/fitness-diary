import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { StaffDmPane } from '../../components/chat/StaffDmPane.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

/** /messages/dm/:userId — переписка с коллегой или администрацией клуба. У главного админа — панель справа в «Сообщениях». */
export function StaffDmThread() {
  const { userId = '' } = useParams()
  const { isAdmin } = useAuth()
  if (isAdmin) return <Navigate to={`/messages?dm=${encodeURIComponent(userId)}`} replace />
  return (
    <div className="staff-inbox">
      <StaffDmPane
        key={userId}
        userId={userId}
        backTo="/messages?tab=chats"
        back={
          <Link to="/messages?tab=chats" className="btn btn-ghost btn-sm staff-inbox__back">
            <ArrowLeft size={18} aria-hidden />
            Все диалоги
          </Link>
        }
      />
    </div>
  )
}
