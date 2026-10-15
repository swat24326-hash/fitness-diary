import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { ChatHeadBar } from '../../components/chat/ChatHeadBar.jsx'
import { MessengerBack } from '../../components/chat/MessengerLayout.jsx'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { StaffGroupMuteItem, StaffGroupThreadView } from '../../components/chat/StaffGroupThreadView.jsx'
import { useStaffGroupThread } from '../../hooks/useStaffGroupThread.js'
import { coachGroupApi } from '../../lib/coach/coachApiClient.js'
import { hasCoachSession } from '../../lib/coach/coachSession.js'
import { STAFF_GROUP_TITLE_RU, staffGroupMembersRu } from '../../lib/chat/staffGroupCore.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'
import '../../styles/chat-group.css'

/** /coach/group — чат своего клуба на телефоне тренера; сюда же ведёт push о сообщении в чате клуба. */
export function CoachGroupPage() {
  const { onSessionGone } = useCoachApp()
  const group = useStaffGroupThread(coachGroupApi, 'coach')
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
          title={STAFF_GROUP_TITLE_RU}
          subtitle={info ? `${info.name} · ${staffGroupMembersRu(info.members)}` : ''}
          searchHostRef={setSearchHost}
          menu={chat.meta ? <StaffGroupMuteItem muted={muted} onToggle={() => void toggleMute()} error={muteError} /> : null}
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
        <StaffGroupThreadView group={group} searchHost={searchHost} />
      )}
    </CoachShell>
  )
}
