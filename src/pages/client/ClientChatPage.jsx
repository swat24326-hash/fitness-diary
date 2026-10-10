import { Navigate, useParams } from 'react-router-dom'
import { RefreshCw, WifiOff } from 'lucide-react'
import { ChatThreadView } from '../../components/chat/ChatThreadView.jsx'
import { isChatKind } from '../../lib/chat/chatAccessCore.js'
import { chatClientEmptyRu, chatThreadTitleRu } from '../../lib/chat/chatUiCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientChatThread } from './useClientChat.js'

/** /me/chat/:kind — переписка с тренером, менеджером по продажам или управляющим. */
export function ClientChatPage() {
  const { kind = '' } = useParams()
  const chat = useClientChatThread(kind)
  if (!hasClientSession()) return <Navigate to="/me" replace />
  if (!isChatKind(kind)) return <Navigate to="/me/inbox" replace />
  const club = readClientMeCache()?.data?.club ?? null

  return (
    <ClientMeShell actions={<ClientPageActions onRefresh={chat.reload} refreshing={chat.status === 'loading'} />} club={club}>
      <ClientPageTitle title={chatThreadTitleRu(kind, chat.meta?.name)} to="/me/inbox" />
      {!chat.messages ? (
        chat.status === 'error' ? (
          <ClientMeStatus icon={WifiOff} title="Не открылось" hint={chat.error}>
            <button type="button" className="btn btn-secondary btn-touch" onClick={chat.reload}>
              Повторить
            </button>
          </ClientMeStatus>
        ) : (
          <ClientMeStatus icon={RefreshCw} spin title="Открываем…" />
        )
      ) : (
        <ChatThreadView
          messages={chat.messages}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          peerReadAt={chat.meta?.peer_read_at}
          onSubmit={chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          emptyHint={chatClientEmptyRu(kind)}
        />
      )}
    </ClientMeShell>
  )
}
