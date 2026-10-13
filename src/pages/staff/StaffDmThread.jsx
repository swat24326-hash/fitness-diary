import { Navigate, useParams } from 'react-router-dom'

/** /messages/dm/:userId (ссылки из уведомлений) — переписка открывается панелью справа в «Сообщениях». */
export function StaffDmThread() {
  const { userId = '' } = useParams()
  return <Navigate to={`/messages?dm=${encodeURIComponent(userId)}`} replace />
}
