import { useCallback, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ChatThreadView } from '../../components/chat/ChatThreadView.jsx'
import { useChatThread } from '../../hooks/useChatThread.js'
import { fetchCoachChatThread, sendCoachChatMessage } from '../../lib/coach/coachApiClient.js'
import { hasCoachSession } from '../../lib/coach/coachSession.js'
import { chatStaffReadOnlyRu } from '../../lib/chat/chatUiCore.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'

/** /coach/chat/:clientId — диалог «Тренер» с клиентом; сюда же ведёт push о новом сообщении. */
export function CoachChatPage() {
  const { clientId = '' } = useParams()
  const { onSessionGone } = useCoachApp()
  const load = useCallback((before) => fetchCoachChatThread(clientId, before), [clientId])
  const send = useCallback((outgoing) => sendCoachChatMessage(clientId, outgoing), [clientId])
  const chat = useChatThread({ key: clientId, side: 'staff', load, send })
  const meta = chat.meta

  // useChatThread отдаёт только текст ошибки; закончившийся вход видно по стёртой сессии.
  useEffect(() => {
    if ((chat.status === 'error' || chat.sendError) && !hasCoachSession()) onSessionGone(chat.error || chat.sendError)
  }, [chat.status, chat.error, chat.sendError, onSessionGone])

  return (
    <CoachShell
      tabs={false}
      title={meta?.client?.name || 'Клиент'}
      actions={
        <Link to="/coach/chats" className="btn btn-ghost btn-icon-square btn-touch" aria-label="Все диалоги" title="Все диалоги">
          <ArrowLeft size={20} aria-hidden />
        </Link>
      }
    >
      {!chat.messages ? (
        <CoachLoadState status={chat.status} error={chat.error} onRetry={chat.reload} />
      ) : (
        <ChatThreadView
          messages={chat.messages}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          peerReadAt={meta?.peer_read_at}
          onSubmit={chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          canWrite={Boolean(meta?.can_write)}
          readOnlyHint={chatStaffReadOnlyRu(meta)}
          emptyHint="Сообщений пока нет. Клиент увидит ваш ответ в приложении клуба."
          placeholder="Ответ клиенту"
        />
      )}
    </CoachShell>
  )
}
