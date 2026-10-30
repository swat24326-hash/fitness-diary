import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatHeadBar } from '../../components/chat/ChatHeadBar.jsx'
import { MessengerBack } from '../../components/chat/MessengerLayout.jsx'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { ChatThreadView } from '../../components/chat/ChatThreadView.jsx'
import { chatKindLabelRu, isChatKind } from '../../lib/chat/chatAccessCore.js'
import { isAzInstructorChatKind } from '../../lib/chat/clientAzChatCore.js'
import { chatClientEmptyRu } from '../../lib/chat/chatUiCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageMenuItems } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientChatThread } from './useClientChat.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

/** /me/chat/:kind[/:peerUserId] — тренер, менеджер, жалобы или инструктор АЗ. */
export function ClientChatPage() {
  const { kind = '', peerUserId = '' } = useParams()
  const peer = String(peerUserId ?? '').trim() || null
  const chat = useClientChatThread(kind, peer)
  const [searchHost, setSearchHost] = useState(null)
  if (!hasClientSession()) return <Navigate to={CLIENT_HOME} replace />
  if (!isChatKind(kind)) return <Navigate to="/me/inbox" replace />
  if (isAzInstructorChatKind(kind) && !peer) return <Navigate to="/me/inbox" replace />
  if (!isAzInstructorChatKind(kind) && peer) return <Navigate to={`/me/chat/${kind}`} replace />
  const club = readClientMeCache()?.data?.club ?? null
  const who = String(chat.meta?.name ?? '').trim()
  const roleLabel = chat.meta?.label || chatKindLabelRu(kind)

  return (
    <ClientMeShell
      club={club}
      bar={
        <ChatHeadBar
          back={<MessengerBack to="/me/inbox" />}
          icon={MessageCircle}
          photo={chat.meta?.photo}
          status={chat.meta?.status}
          title={who || roleLabel}
          subtitle={who ? roleLabel : ''}
          searchHostRef={setSearchHost}
          menu={<ClientPageMenuItems onRefresh={chat.reload} refreshing={chat.status === 'loading'} />}
        />
      }
    >
      {!chat.messages ? (
        chat.status === 'error' ? (
          <ClientMeStatus icon={WifiOff} title="Не открылось" hint={chat.error}>
            <ChatOpenErrorAction errorStatus={chat.errorStatus} onRetry={chat.reload} backTo="/me/inbox" />
          </ClientMeStatus>
        ) : (
          <ClientMeStatus icon={RefreshCw} spin title="Открываем…" />
        )
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
          peerReadAt={chat.meta?.peer_read_at}
          onSubmit={chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          emptyHint={chatClientEmptyRu(kind)}
          searchHost={searchHost}
        />
      )}
    </ClientMeShell>
  )
}
