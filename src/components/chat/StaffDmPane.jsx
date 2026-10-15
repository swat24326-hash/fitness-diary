import { useState } from 'react'
import { MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatHeadBar } from './ChatHeadBar.jsx'
import { ChatOpenErrorAction } from './ChatOpenErrorAction.jsx'
import { ChatThreadView } from './ChatThreadView.jsx'
import { useStaffDmThread } from '../../hooks/useStaffChat.js'
import { STAFF_DM_READ_ONLY_RU } from '../../lib/chat/chatUiCore.js'

/**
 * Шапка и лента личного диалога сотрудника — отдельной страницей (/messages/dm/:id) и панелью справа у главного админа.
 * @param {{ userId: string, backTo: string, back?: import('react').ReactNode, onSent?: () => void }} props
 *   back — ссылка «назад» слева в шапке; onSent — после отправки (обновить список рядом); initialDraft — текст в поле
 */
export function StaffDmPane({ userId, backTo, back = null, onSent, initialDraft = '' }) {
  const chat = useStaffDmThread(userId)
  const [searchHost, setSearchHost] = useState(null)
  const submit = async (...args) => {
    const sent = await chat.submit(...args)
    if (sent) onSent?.()
    return sent
  }
  const peer = chat.meta?.peer
  return (
    <>
      <ChatHeadBar back={back} icon={MessageCircle} photo={peer?.photo} status={peer?.status} title={peer?.name || 'Сотрудник'} subtitle={peer?.label || ''} searchHostRef={setSearchHost} />
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
        <ChatThreadView
          onAtBottom={chat.onAtBottom}
          onReact={chat.react}
          reply={chat.reply}
          search={chat.search}
          voice={chat.voice}
          messages={chat.messages}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          peerReadAt={chat.meta?.peer_read_at}
          onSubmit={onSent ? submit : chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          canWrite={Boolean(chat.meta?.can_write)}
          readOnlyHint={STAFF_DM_READ_ONLY_RU}
          emptyHint="Сообщений пока нет. Собеседник увидит ваше сообщение в «Сообщениях клуба»."
          placeholder="Сообщение"
          initialDraft={initialDraft}
          searchHost={searchHost}
        />
      )}
    </>
  )
}
