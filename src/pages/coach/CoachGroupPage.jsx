import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { StaffGroupMuteButton, StaffGroupThreadView } from '../../components/chat/StaffGroupThreadView.jsx'
import { useStaffGroupThread } from '../../hooks/useStaffGroupThread.js'
import { coachGroupApi } from '../../lib/coach/coachApiClient.js'
import { hasCoachSession } from '../../lib/coach/coachSession.js'
import { STAFF_GROUP_TITLE_RU } from '../../lib/chat/staffGroupCore.js'
import { useCoachApp } from './CoachAppContext.jsx'
import { CoachShell } from './CoachShell.jsx'
import { CoachLoadState } from './CoachStatus.jsx'
import '../../styles/chat-group.css'

/** /coach/group — чат своего клуба на телефоне тренера; сюда же ведёт push о сообщении в чате клуба. */
export function CoachGroupPage() {
  const { onSessionGone } = useCoachApp()
  const group = useStaffGroupThread(coachGroupApi, 'coach')
  const { chat, muted, toggleMute, muteError } = group

  useEffect(() => {
    if ((chat.status === 'error' || chat.sendError) && !hasCoachSession()) onSessionGone(chat.error || chat.sendError)
  }, [chat.status, chat.error, chat.sendError, onSessionGone])

  return (
    <CoachShell
      tabs={false}
      title={chat.meta?.group?.name ? `${STAFF_GROUP_TITLE_RU} · ${chat.meta.group.name}` : STAFF_GROUP_TITLE_RU}
      actions={
        <>
          {chat.meta ? <StaffGroupMuteButton muted={muted} onToggle={() => void toggleMute()} error={muteError} /> : null}
          <Link to="/coach/chats" className="btn btn-ghost btn-icon-square btn-touch" aria-label="Все диалоги" title="Все диалоги">
            <ArrowLeft size={20} aria-hidden />
          </Link>
        </>
      }
    >
      {!chat.messages ? (
        <CoachLoadState
          status={chat.status}
          error={chat.error}
          action={<ChatOpenErrorAction errorStatus={chat.errorStatus} onRetry={chat.reload} backTo="/coach/chats" />}
        />
      ) : (
        <StaffGroupThreadView group={group} />
      )}
    </CoachShell>
  )
}
