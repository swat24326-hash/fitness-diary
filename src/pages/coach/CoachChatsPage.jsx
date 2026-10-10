import { MessageCircle } from 'lucide-react'
import { ChatThreadList } from '../../components/chat/ChatThreadList.jsx'
import { fetchCoachChats } from '../../lib/coach/coachApiClient.js'
import { chatThreadPreviewRu } from '../../lib/chat/chatUiCore.js'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState, CoachStatus } from './CoachStatus.jsx'
import { useCoachLoad } from './useCoachLoad.js'

/** «Сообщения»: диалоги «Тренер» своих клиентов, непрочитанные сверху (порядок — сервер). */
export function CoachChatsPage() {
  const { data, status, error, reload } = useCoachLoad(fetchCoachChats)
  const threads = data?.threads ?? null

  let body
  if (!threads) body = <CoachLoadState status={status} error={error} onRetry={() => void reload()} />
  else if (!threads.length) {
    body = <CoachStatus icon={MessageCircle} title="Пока пусто" hint="Здесь появятся сообщения клиентов из приложения клуба." />
  } else {
    body = (
      <ChatThreadList
        rows={threads.map((t) => ({
          key: t.client_id,
          to: `/coach/chat/${t.client_id}`,
          kind: t.kind,
          title: t.client_name,
          avatar: t.client_name,
          preview: chatThreadPreviewRu(t, 'staff'),
          unread: t.unread,
          unreadCount: t.unread_count,
          at: t.last_message_at,
        }))}
      />
    )
  }
  return <CoachShell title="Сообщения">{body}</CoachShell>
}
