import { useAuth } from '../../context/AuthContext.jsx'
import { useStaffChats } from '../../hooks/useStaffChat.js'
import { AdminMessenger } from './AdminMessenger.jsx'
import { StaffMessenger } from './StaffMessenger.jsx'
import { useStaffInbox } from './useStaffInbox.js'

/**
 * /messages — конверт в шапке. Тренер, менеджер, управляющий: мессенджер клуба (папки переписки, последней — «Рассылки»).
 * Главному админу рассылки не приходят — у него мессенджер сотрудников сети (AdminMessenger).
 */
export function StaffInboxPage() {
  const { isAdmin } = useAuth()
  const inbox = useStaffInbox(!isAdmin)
  const chats = useStaffChats(true)
  if (isAdmin) return <AdminMessenger chatList={chats} />
  return <StaffMessenger chats={chats} inbox={inbox} />
}
