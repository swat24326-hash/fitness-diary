import { useMemo, useState } from 'react'
import { RefreshCw, Users, WifiOff } from 'lucide-react'
import { ChatHeadBar } from './ChatHeadBar.jsx'
import { ChatOpenErrorAction } from './ChatOpenErrorAction.jsx'
import { StaffGroupMuteButton, StaffGroupThreadView } from './StaffGroupThreadView.jsx'
import { useStaffGroupThread } from '../../hooks/useStaffGroupThread.js'
import { staffGroupApi } from '../../lib/chat/staffChatApiClient.js'
import { STAFF_GROUP_TITLE_RU, staffGroupMembersRu } from '../../lib/chat/staffGroupCore.js'
import { STAFF_INBOX_CHANGED } from '../../lib/inbox/staffInboxApiClient.js'
import '../../styles/chat-group.css'

const announce = () => window.dispatchEvent(new Event(STAFF_INBOX_CHANGED))

/**
 * Чат клуба панелью справа в «Сообщениях» (сотрудник — свой клуб, главный админ — выбранный).
 * @param {{ clubId: string, backTo: string, back?: import('react').ReactNode, onSent?: () => void }} props
 */
export function StaffGroupPane({ clubId, backTo, back = null, onSent }) {
  const api = useMemo(() => staffGroupApi(clubId), [clubId])
  const [searchHost, setSearchHost] = useState(null)
  const thread = useStaffGroupThread(api, clubId, () => {
    announce()
    onSent?.()
  })
  const { chat, muted, toggleMute, muteError } = thread
  const group = chat.meta?.group
  const submit = async (...args) => {
    const sent = await chat.submit(...args)
    if (sent) onSent?.()
    return sent
  }
  return (
    <>
      <ChatHeadBar
        back={back}
        icon={Users}
        title={STAFF_GROUP_TITLE_RU}
        subtitle={group ? `${group.name} · ${staffGroupMembersRu(group.members)}` : ''}
        searchHostRef={setSearchHost}
        actions={chat.meta ? <StaffGroupMuteButton muted={muted} onToggle={() => void toggleMute()} error={muteError} /> : null}
      />
      {!chat.messages ? (
        <div className="card staff-inbox__status" role="status">
          {chat.status === 'error' ? <WifiOff size={28} aria-hidden /> : <RefreshCw size={28} aria-hidden className="icon-spin" />}
          <strong>{chat.status === 'error' ? 'Не открылось' : 'Открываем…'}</strong>
          {chat.status === 'error' ? (
            <>
              <p className="muted">{chat.error}</p>
              <ChatOpenErrorAction errorStatus={chat.errorStatus} onRetry={chat.reload} backTo={backTo} />
            </>
          ) : null}
        </div>
      ) : (
        <StaffGroupThreadView group={thread} onSubmit={submit} searchHost={searchHost} />
      )}
    </>
  )
}
