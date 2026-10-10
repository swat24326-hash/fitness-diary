import { MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatThreadList } from '../../components/chat/ChatThreadList.jsx'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'

function Status({ icon: Icon, title, hint, spin = false }) {
  return (
    <div className="card staff-inbox__status" role="status">
      <Icon size={28} aria-hidden className={spin ? 'icon-spin' : undefined} />
      <strong>{title}</strong>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  )
}

/**
 * Вкладка «Диалоги» в /messages: переписка с клиентами, непрочитанные сверху.
 * @param {ReturnType<typeof import('../../hooks/useStaffChat.js').useStaffChats>} props
 */
export function StaffChatList({ threads, status, error }) {
  if (!threads) {
    return status === 'error' ? (
      <Status icon={WifiOff} title="Не загрузилось" hint={error || 'Проверьте интернет и обновите.'} />
    ) : (
      <Status icon={RefreshCw} spin title="Загружаем…" />
    )
  }
  if (!threads.length) {
    return <Status icon={MessageCircle} title="Пока пусто" hint="Здесь появятся сообщения клиентов из приложения клуба." />
  }
  const rows = threads.map((t) => ({
    key: `${t.client_id}:${t.kind}`,
    to: `/messages/chat/${t.client_id}/${t.kind}`,
    kind: t.kind,
    title: t.kind === 'trainer' ? t.client_name : `${t.client_name} · ${t.label}`,
    preview: chatThreadPreviewRu(t, 'staff'),
    avatar: t.client_name,
    unread: t.unread,
    unreadCount: t.unread_count,
    at: t.last_message_at,
  }))
  return <ChatThreadList rows={rows} />
}
