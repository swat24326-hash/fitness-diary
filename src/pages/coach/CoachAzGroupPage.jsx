import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { ChatHeadBar } from '../../components/chat/ChatHeadBar.jsx'
import { MessengerBack } from '../../components/chat/MessengerLayout.jsx'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { StaffGroupMuteItem, StaffGroupThreadView } from '../../components/chat/StaffGroupThreadView.jsx'
import { azGroupMuteCopy, azGroupThreadCopy } from '../../components/chat/azGroupThreadCopy.js'
import { useAzGroupThread } from '../../hooks/useAzGroupThread.js'
import { coachAzGroupApi } from '../../lib/coach/coachApiClient.js'
import { hasCoachSession } from '../../lib/coach/coachSession.js'
import { AZ_GROUP_TITLE_RU, azGroupMembersRu } from '../../lib/chat/azGroupCore.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import '../../styles/chat-group.css'

const AZ_CACHE = screenCacheKey('coach', 'az-group')

/** /coach/az-group — группа АЗ на телефоне инструктора; сюда же ведёт push. */
export function CoachAzGroupPage() {
  const { onSessionGone } = useCoachApp()
  const group = useAzGroupThread(coachAzGroupApi, 'coach', undefined, AZ_CACHE)
  const { chat, muted, toggleMute, muteError } = group
  const info = chat.meta?.group
  const [searchHost, setSearchHost] = useState(null)

  useEffect(() => {
    if ((chat.status === 'error' || chat.sendError) && !hasCoachSession()) onSessionGone(chat.error || chat.sendError)
  }, [chat.status, chat.error, chat.sendError, onSessionGone])

  return (
    <CoachShell
      tabs={false}
      bar={
        <ChatHeadBar
          back={<MessengerBack to="/coach/chats" />}
          icon={Users}
          title={AZ_GROUP_TITLE_RU}
          subtitle={info ? azGroupMembersRu(info.members) : ''}
          searchHostRef={setSearchHost}
          menu={chat.meta ? <StaffGroupMuteItem muted={muted} onToggle={() => void toggleMute()} error={muteError} {...azGroupMuteCopy} /> : null}
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
        <StaffGroupThreadView group={group} searchHost={searchHost} {...azGroupThreadCopy} />
      )}
    </CoachShell>
  )
}
