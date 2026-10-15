import { RefreshCw } from 'lucide-react'
import { ChatThreadList } from '../../components/chat/ChatThreadList.jsx'
import { chatThreadPreviewRu, chatThreadTitleRu } from '../../lib/chat/chatUiCore.js'
import { ClientMeStatus } from './ClientMeStatus.jsx'

/** «Сообщения» → «Диалоги»: переписка с тренером, менеджером и управляющим. */
export function ClientChatThreadsSection({ threads, error }) {
  if (!threads) {
    return error ? (
      <p className="client-me-offline" role="alert">
        {error}
      </p>
    ) : (
      <ClientMeStatus icon={RefreshCw} spin title="Загружаем…" />
    )
  }
  const rows = threads.map((t) => ({
    key: t.kind,
    to: `/me/chat/${t.kind}`,
    kind: t.kind,
    title: chatThreadTitleRu(t.kind, t.name),
    preview: chatThreadPreviewRu(t, 'client'),
    avatar: t.kind === 'trainer' ? t.name : '',
    photo: t.photo ?? null,
    status: t.status ?? null,
    unread: t.unread,
    unreadCount: t.unread_count,
    at: t.last_message_at,
    reaction: t.reaction,
  }))
  return (
    <section aria-label="Переписка с клубом">
      <ChatThreadList rows={rows} />
    </section>
  )
}
