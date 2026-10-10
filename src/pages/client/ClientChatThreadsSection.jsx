import { ChatThreadList } from '../../components/chat/ChatThreadList.jsx'
import { chatThreadPreviewRu, chatThreadTitleRu } from '../../lib/chat/chatUiCore.js'

/** Верх экрана «Сообщения»: диалоги с тренером, менеджером и управляющим. */
export function ClientChatThreadsSection({ threads, error }) {
  if (!threads) {
    return error ? (
      <p className="client-me-offline" role="alert">
        {error}
      </p>
    ) : null
  }
  const rows = threads.map((t) => ({
    key: t.kind,
    to: `/me/chat/${t.kind}`,
    kind: t.kind,
    title: chatThreadTitleRu(t.kind, t.name),
    preview: chatThreadPreviewRu(t, 'client'),
    avatar: t.kind === 'trainer' ? t.name : '',
    unread: t.unread,
    unreadCount: t.unread_count,
    at: t.last_message_at,
  }))
  return (
    <section aria-label="Переписка с клубом">
      <ChatThreadList rows={rows} />
    </section>
  )
}
