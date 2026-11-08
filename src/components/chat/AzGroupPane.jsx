import { useMemo, useState } from 'react'
import { RefreshCw, Users, WifiOff } from 'lucide-react'
import { ChatHeadBar } from './ChatHeadBar.jsx'
import { ChatOpenErrorAction } from './ChatOpenErrorAction.jsx'
import { StaffGroupMuteItem, StaffGroupThreadView } from './StaffGroupThreadView.jsx'
import { azGroupMuteCopy, azGroupThreadCopy } from './azGroupThreadCopy.js'
import { useAzGroupThread } from '../../hooks/useAzGroupThread.js'
import { staffAzGroupApi } from '../../lib/chat/staffChatApiClient.js'
import { AZ_GROUP_TITLE_RU, azGroupMembersRu } from '../../lib/chat/azGroupCore.js'
import { STAFF_INBOX_CHANGED } from '../../lib/inbox/staffInboxApiClient.js'
import '../../styles/chat-group.css'

const announce = () => window.dispatchEvent(new Event(STAFF_INBOX_CHANGED))

/**
 * Группа АЗ панелью справа в «Сообщениях» планшета (только свой тред инструктора).
 * @param {{ instructorUserId: string, backTo: string, back?: import('react').ReactNode, onSent?: () => void }} props
 */
export function AzGroupPane({ instructorUserId, backTo, back = null, onSent }) {
  const api = useMemo(() => staffAzGroupApi(instructorUserId), [instructorUserId])
  const [searchHost, setSearchHost] = useState(null)
  const thread = useAzGroupThread(api, instructorUserId, () => {
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
        title={AZ_GROUP_TITLE_RU}
        subtitle={group ? azGroupMembersRu(group.members) : ''}
        searchHostRef={setSearchHost}
        menu={chat.meta ? <StaffGroupMuteItem muted={muted} onToggle={() => void toggleMute()} error={muteError} {...azGroupMuteCopy} /> : null}
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
        <StaffGroupThreadView group={thread} onSubmit={submit} searchHost={searchHost} {...azGroupThreadCopy} />
      )}
    </>
  )
}
