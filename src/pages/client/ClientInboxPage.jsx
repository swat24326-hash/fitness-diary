import { Navigate, useSearchParams } from 'react-router-dom'
import { Gift, Inbox, Megaphone, MessagesSquare, RefreshCw, WifiOff } from 'lucide-react'
import { InboxItemList } from '../../components/inbox/InboxItemList.jsx'
import { CLIENT_INBOX_NEWS_PATH, clientInboxTab, inboxPointsLineRu } from '../../lib/client/clientInboxUiCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientChatThreadsSection } from './ClientChatThreadsSection.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { ClientSegments } from './ClientSegments.jsx'
import { useClientChats } from './useClientChat.js'
import { useClientInbox } from './useClientInbox.js'

function NewsSection({ items, points, status, error }) {
  const pointsLine = inboxPointsLineRu(points)
  let content
  if (!items) {
    content =
      status === 'error' ? (
        <ClientMeStatus icon={WifiOff} title="Не загрузилось" hint={error} />
      ) : (
        <ClientMeStatus icon={RefreshCw} spin title="Загружаем…" />
      )
  } else if (!items.length) {
    content = <ClientMeStatus icon={Inbox} title="Пока пусто" hint="Здесь появятся объявления и опросы вашего клуба." />
  } else {
    content = <InboxItemList items={items} basePath="/me/inbox" />
  }
  return (
    <>
      {items && status === 'error' ? (
        <p className="client-me-offline" role="alert">
          {error}
        </p>
      ) : null}
      {pointsLine ? (
        <p className="client-inbox__points" data-testid="client-inbox-points">
          <Gift size={18} aria-hidden />
          <span>{pointsLine}</span>
        </p>
      ) : null}
      {content}
    </>
  )
}

/** /me/inbox — «Сообщения»: переключатель «Диалоги» (тренер и клуб) | «От клуба» (?tab=news). */
export function ClientInboxPage() {
  const inbox = useClientInbox()
  const chats = useClientChats()
  const [params] = useSearchParams()
  if (!hasClientSession() || inbox.status === 'signed_out' || chats.status === 'signed_out') return <Navigate to="/me" replace />
  const cached = readClientMeCache()?.data
  const chatAttention = Number(cached?.chat_attention) || 0
  const inboxAttention = Number(cached?.inbox_attention) || 0
  const tab = clientInboxTab(params.get('tab'), { chatAttention, inboxAttention })
  const refreshing = inbox.status === 'loading' || chats.status === 'loading'

  return (
    <ClientMeShell
      actions={
        <ClientPageActions
          onRefresh={() => {
            inbox.reload()
            chats.reload()
          }}
          refreshing={refreshing}
        />
      }
      club={cached?.club ?? null}
      tabs
    >
      <ClientPageTitle title="Сообщения" back={false} />
      <ClientSegments
        label="Разделы сообщений"
        items={[
          { key: 'chats', to: '/me/inbox?tab=chats', label: 'Диалоги', icon: MessagesSquare, active: tab === 'chats', count: chatAttention },
          { key: 'news', to: CLIENT_INBOX_NEWS_PATH, label: 'От клуба', icon: Megaphone, active: tab === 'news', count: inboxAttention },
        ]}
      />
      {tab === 'chats' ? (
        <ClientChatThreadsSection threads={chats.threads} error={chats.status === 'error' ? chats.error : ''} />
      ) : (
        <NewsSection items={inbox.items} points={inbox.points} status={inbox.status} error={inbox.error} />
      )}
    </ClientMeShell>
  )
}
