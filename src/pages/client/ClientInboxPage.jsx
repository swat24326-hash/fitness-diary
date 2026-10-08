import { Navigate } from 'react-router-dom'
import { Gift, Inbox, RefreshCw, WifiOff } from 'lucide-react'
import { InboxItemList } from '../../components/inbox/InboxItemList.jsx'
import { inboxPointsLineRu } from '../../lib/client/clientInboxUiCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { useClientInbox } from './useClientInbox.js'

/** /me/inbox — объявления и опросы клуба, новые сверху. */
export function ClientInboxPage() {
  const { items, points, status, error, reload } = useClientInbox()
  if (!hasClientSession() || status === 'signed_out') return <Navigate to="/me" replace />
  const club = readClientMeCache()?.data?.club ?? null
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
    <ClientMeShell actions={<ClientPageActions onRefresh={reload} refreshing={status === 'loading'} />} club={club}>
      <ClientPageTitle title="Входящие" />
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
    </ClientMeShell>
  )
}
