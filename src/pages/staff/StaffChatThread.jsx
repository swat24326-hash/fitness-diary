import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatThreadView } from '../../components/chat/ChatThreadView.jsx'
import { useAuth } from '../../context/AuthContext'
import { chatKindLabelRu } from '../../lib/chat/chatAccessCore.js'
import { chatStaffReadOnlyRu } from '../../lib/chat/chatUiCore.js'
import { useStaffChatThread } from '../../hooks/useStaffChat.js'

/** /messages/chat/:clientId/:kind — переписка сотрудника с клиентом. Админ попадает сюда из карточки клиента. */
export function StaffChatThread() {
  const { clientId = '', kind = '' } = useParams()
  const { isAdmin } = useAuth()
  const chat = useStaffChatThread(clientId, kind)
  const meta = chat.meta
  const back = isAdmin ? `/admin/clients/${clientId}` : '/messages?tab=chats'

  return (
    <div className="staff-inbox">
      <Link to={back} className="btn btn-ghost btn-sm staff-inbox__back">
        <ArrowLeft size={18} aria-hidden />
        {isAdmin ? 'Карточка клиента' : 'Все диалоги'}
      </Link>
      <header className="chat-head">
        <h1 className="staff-inbox__title">
          <MessageCircle size={22} aria-hidden />
          {meta?.client?.name || 'Клиент'}
        </h1>
        <small className="muted">{chatKindLabelRu(kind)}</small>
      </header>
      {!chat.messages ? (
        <div className="card staff-inbox__status" role="status">
          {chat.status === 'error' ? <WifiOff size={28} aria-hidden /> : <RefreshCw size={28} aria-hidden className="icon-spin" />}
          <strong>{chat.status === 'error' ? 'Не открылось' : 'Открываем…'}</strong>
          {chat.status === 'error' ? (
            <>
              <p className="muted">{chat.error}</p>
              <button type="button" className="btn btn-secondary btn-touch" onClick={chat.reload}>
                Повторить
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <ChatThreadView
          messages={chat.messages}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          peerReadAt={meta?.peer_read_at}
          onSubmit={chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          canWrite={Boolean(meta?.can_write)}
          readOnlyHint={chatStaffReadOnlyRu(meta)}
          emptyHint="Сообщений пока нет. Клиент увидит ваше сообщение в приложении клуба."
          placeholder="Ответ клиенту"
        />
      )}
    </div>
  )
}
