import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatOpenErrorAction } from '../../components/chat/ChatOpenErrorAction.jsx'
import { ChatThreadView } from '../../components/chat/ChatThreadView.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useStaffDmThread } from '../../hooks/useStaffChat.js'
import { STAFF_DM_READ_ONLY_RU } from '../../lib/chat/chatUiCore.js'

/** /messages/dm/:userId — переписка с коллегой или администрацией клуба. */
export function StaffDmThread() {
  const { userId = '' } = useParams()
  const chat = useStaffDmThread(userId)
  const peer = chat.meta?.peer
  const { isAdmin } = useAuth()

  return (
    <div className={`staff-inbox${isAdmin ? ' staff-inbox--thread-wide' : ''}`}>
      <Link to="/messages?tab=chats" className="btn btn-ghost btn-sm staff-inbox__back">
        <ArrowLeft size={18} aria-hidden />
        Все диалоги
      </Link>
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
              <ChatOpenErrorAction errorStatus={chat.errorStatus} onRetry={chat.reload} backTo="/messages?tab=chats" />
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
    </div>
  )
}
