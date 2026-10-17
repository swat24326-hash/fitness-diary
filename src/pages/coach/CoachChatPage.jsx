import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { ChatHeadBar } from '../../components/chat/ChatHeadBar.jsx'
import { MessengerBack } from '../../components/chat/MessengerLayout.jsx'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { ChatThreadView } from '../../components/chat/ChatThreadView.jsx'
import { useChatThread } from '../../hooks/useChatThread.js'
import { coachChatVoice, fetchCoachChatThread, reactCoachChatMessage, searchCoachChat, sendCoachChatMessage } from '../../lib/coach/coachApiClient.js'
import { hasCoachSession } from '../../lib/coach/coachSession.js'
import { chatStaffReadOnlyRu } from '../../lib/chat/chatUiCore.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'

/**
 * /coach/chat/:clientId — диалог «Тренер» с клиентом; сюда же ведёт push о новом сообщении.
 * /coach/chat/:clientId/supervisor — «Жалобы и предложения» (тренер, связанный с управляющим; ответ — от управляющего).
 */
export function CoachChatPage() {
  const { clientId = '', kind: kindParam = '' } = useParams()
  const kind = kindParam === 'supervisor' ? 'supervisor' : 'trainer'
  const { onSessionGone } = useCoachApp()
  const load = useCallback((before, opts) => fetchCoachChatThread(clientId, before, kind, opts?.seen), [clientId, kind])
  const send = useCallback((outgoing) => sendCoachChatMessage(clientId, outgoing, kind), [clientId, kind])
  const react = useCallback((messageId, emoji) => reactCoachChatMessage(clientId, messageId, emoji, kind), [clientId, kind])
  const search = useCallback((q) => searchCoachChat(clientId, q, kind), [clientId, kind])
  const voice = useMemo(() => coachChatVoice(clientId, kind), [clientId, kind])
  const cacheKey = screenCacheKey('coach', 'chat', `${clientId}:${kind}`)
  const chat = useChatThread({ key: `${clientId}:${kind}`, side: 'staff', cacheKey, load, send, react, search, voice })
  const meta = chat.meta
  const complaint = kind === 'supervisor'
  const [searchHost, setSearchHost] = useState(null)

  // useChatThread отдаёт только текст ошибки; закончившийся вход видно по стёртой сессии.
  useEffect(() => {
    if ((chat.status === 'error' || chat.sendError) && !hasCoachSession()) onSessionGone(chat.error || chat.sendError)
  }, [chat.status, chat.error, chat.sendError, onSessionGone])

  const name = meta?.client?.name || 'Клиент'
  return (
    <CoachShell
      tabs={false}
      bar={
        <ChatHeadBar
          back={<MessengerBack to="/coach/chats" />}
          icon={MessageCircle}
          photo={meta?.client?.photo}
          status={meta?.client?.status}
          title={name}
          searchHostRef={setSearchHost}
        />
      }
    >
      {!chat.messages ? (
        <CoachLoadState
          status={chat.status}
          error={chat.error}
          action={<ChatOpenErrorAction errorStatus={chat.errorStatus} onRetry={chat.reload} backTo="/coach/chats" />}
        />
      ) : (
        <ChatThreadView
          onAtBottom={chat.onAtBottom}
          onReact={chat.react}
          reply={chat.reply}
          search={chat.search}
          voice={chat.voice}
          messages={chat.messages}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          peerReadAt={meta?.peer_read_at}
          onSubmit={chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          canWrite={Boolean(meta?.can_write)}
          readOnlyHint={chatStaffReadOnlyRu(meta)}
          emptyHint={
            complaint
              ? 'Сообщений пока нет. Клиент увидит ответ от управляющего в приложении клуба.'
              : 'Сообщений пока нет. Клиент увидит ваш ответ в приложении клуба.'
          }
          placeholder={complaint ? 'Ответ от управляющего' : 'Ответ клиенту'}
          searchHost={searchHost}
        />
      )}
    </CoachShell>
  )
}
