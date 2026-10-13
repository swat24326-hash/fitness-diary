import { MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatOpenErrorAction } from './ChatOpenErrorAction.jsx'
import { ChatThreadView } from './ChatThreadView.jsx'
import { useStaffDmThread } from '../../hooks/useStaffChat.js'
import { STAFF_DM_READ_ONLY_RU } from '../../lib/chat/chatUiCore.js'

/**
 * Шапка и лента личного диалога сотрудника — отдельной страницей (/messages/dm/:id) и панелью справа у главного админа.
 * @param {{ userId: string, backTo: string, back?: import('react').ReactNode }} props back — ссылка «назад» над шапкой
 */
export function StaffDmPane({ userId, backTo, back = null }) {
  const chat = useStaffDmThread(userId)
  const peer = chat.meta?.peer
  return (
    <>
      {back}
      <header className="chat-head">
        <h1 className="staff-inbox__title">
          <MessageCircle size={22} aria-hidden />
          {peer?.name || 'Сотрудник'}
        </h1>
        {peer?.label ? <small className="muted">{peer.label}</small> : null}
      </header>
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
          dictate={chat.dictate}
          messages={chat.messages}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          peerReadAt={chat.meta?.peer_read_at}
          onSubmit={chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          canWrite={Boolean(chat.meta?.can_write)}
          readOnlyHint={STAFF_DM_READ_ONLY_RU}
          emptyHint="Сообщений пока нет. Собеседник увидит ваше сообщение в «Сообщениях клуба»."
          placeholder="Сообщение"
        />
      )}
    </>
  )
}
