import { RefreshCw } from 'lucide-react'
import { AzGroupRow } from '../../components/chat/AzGroupRow.jsx'
import { ChatThreadList } from '../../components/chat/ChatThreadList.jsx'
import { azGroupClientHref } from '../../lib/chat/azGroupCore.js'
import { clientChatPath, chatDialogKey } from '../../lib/chat/clientAzChatCore.js'
import { chatThreadPreviewRu, chatThreadTitleRu } from '../../lib/chat/chatUiCore.js'
import { ClientMeStatus } from './ClientMeStatus.jsx'

/** «Сообщения» → «Диалоги»: группы АЗ и переписка с тренером / инструкторами / клубом. */
export function ClientChatThreadsSection({ threads, groups = [], error }) {
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
    key: chatDialogKey(t),
    to: clientChatPath(t),
    kind: t.kind,
    title: t.title || chatThreadTitleRu(t.kind, t.name),
    preview: chatThreadPreviewRu(t, 'client'),
    avatar: t.kind === 'trainer' || t.peer_user_id ? t.name : '',
    photo: t.photo ?? null,
    status: t.status ?? null,
    unread: t.unread,
    unreadCount: t.unread_count,
    at: t.last_message_at,
    reaction: t.reaction,
  }))
  return (
    <section aria-label="Переписка с клубом">
      {groups.length ? (
        <ol className="chat-list" data-testid="az-group-rows">
          {groups.map((g) => (
            <AzGroupRow key={g.instructor_user_id} group={g} to={azGroupClientHref(g.instructor_user_id)} />
          ))}
        </ol>
      ) : null}
      <ChatThreadList rows={rows} />
    </section>
  )
}
