import { Navigate, useSearchParams } from 'react-router-dom'
import { CLIENT_NOTIFICATIONS_PATH } from '../../lib/client/clientNotificationsCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { ClientPageActions, ClientPageTitle } from './ClientPageNav.jsx'
import { ClientChatThreadsSection } from './ClientChatThreadsSection.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { useClientChats } from './useClientChat.js'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

/**
 * /me/inbox — только диалоги (тренер, менеджер, жалобы).
 * Рассылки клуба — в «Уведомлениях» (/me/notifications), без второй вкладки.
 */
export function ClientInboxPage() {
  const chats = useClientChats()
  const [params] = useSearchParams()
  if (!hasClientSession() || chats.status === 'signed_out') return <Navigate to={CLIENT_HOME} replace />
  if (params.get('tab') === 'news') return <Navigate to={CLIENT_NOTIFICATIONS_PATH} replace />

  const cached = readClientMeCache()?.data

  return (
    <ClientMeShell
      actions={<ClientPageActions onRefresh={() => chats.reload()} refreshing={chats.status === 'loading'} />}
      club={cached?.club ?? null}
      tabs
      attention={chats.attention == null ? undefined : chats.attention}
    >
      <ClientPageTitle title="Сообщения" back={false} />
      <ClientChatThreadsSection threads={chats.threads} error={chats.status === 'error' ? chats.error : ''} />
    </ClientMeShell>
  )
}
