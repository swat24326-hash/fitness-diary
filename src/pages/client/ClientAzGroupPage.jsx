import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { RefreshCw, Users, WifiOff } from 'lucide-react'
import { ChatHeadBar } from '../../components/chat/ChatHeadBar.jsx'
import { MessengerBack } from '../../components/chat/MessengerLayout.jsx'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { StaffGroupMuteItem, StaffGroupThreadView } from '../../components/chat/StaffGroupThreadView.jsx'
import { azGroupMuteCopy, azGroupThreadCopy } from '../../components/chat/azGroupThreadCopy.js'
import { useAzGroupThread } from '../../hooks/useAzGroupThread.js'
import { clientAzGroupApi } from '../../lib/client/clientAzGroupService.js'
import { AZ_GROUP_TITLE_RU, azGroupMembersRu } from '../../lib/chat/azGroupCore.js'
import { hasClientSession, readClientMeCache } from '../../lib/client/clientSession.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { ClientPageMenuItems } from './ClientPageNav.jsx'
import { ClientMeShell } from './ClientMeShell.jsx'
import { ClientMeStatus } from './ClientMeStatus.jsx'
import { CLIENT_HOME } from '../../lib/pwa/appHomePath.js'

/** /me/az-group/:instructorUserId — общая группа инструктора. Закреп виден, снять его клиент не может. */
export function ClientAzGroupPage() {
  const { instructorUserId = '' } = useParams()
  const id = String(instructorUserId).trim()
  const api = useMemo(() => clientAzGroupApi(id), [id])
  const cacheKey = screenCacheKey('client', 'az-group', id)
  const group = useAzGroupThread(api, id, undefined, cacheKey, 'client')
  const { chat, muted, toggleMute, muteError } = group
  const info = chat.meta?.group
  const [searchHost, setSearchHost] = useState(null)
  if (!hasClientSession()) return <Navigate to={CLIENT_HOME} replace />
  if (!id) return <Navigate to="/me/inbox" replace />
  const club = readClientMeCache()?.data?.club ?? null

  return (
    <ClientMeShell
      club={club}
      bar={
        <ChatHeadBar
          back={<MessengerBack to="/me/inbox" />}
          icon={Users}
          title={info?.name || AZ_GROUP_TITLE_RU}
          subtitle={info ? azGroupMembersRu(info.members) : ''}
          searchHostRef={setSearchHost}
          menu={
            <>
              {chat.meta ? <StaffGroupMuteItem muted={muted} onToggle={() => void toggleMute()} error={muteError} {...azGroupMuteCopy} /> : null}
              <ClientPageMenuItems onRefresh={chat.reload} refreshing={chat.status === 'loading'} />
            </>
          }
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
        <StaffGroupThreadView group={group} searchHost={searchHost} {...azGroupThreadCopy} />
      )}
    </ClientMeShell>
  )
}
