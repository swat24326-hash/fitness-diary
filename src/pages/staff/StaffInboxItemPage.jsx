import { Navigate, useParams } from 'react-router-dom'
import { STAFF_FOLDER_INBOX } from '../../lib/chat/staffMessengerCore.js'

/** /messages/:id (ссылки из уведомлений) — рассылка открывается справа в «Сообщениях клуба», папка «Рассылки». */
export function StaffInboxItemPage() {
  const { id = '' } = useParams()
  return <Navigate to={`/messages?folder=${STAFF_FOLDER_INBOX}&item=${encodeURIComponent(id)}`} replace />
}
