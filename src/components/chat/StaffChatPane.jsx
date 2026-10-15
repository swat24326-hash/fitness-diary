import { useState } from 'react'
import { MessageCircle, RefreshCw, WifiOff } from 'lucide-react'
import { ChatHeadBar } from './ChatHeadBar.jsx'
import { ChatOpenErrorAction } from './ChatOpenErrorAction.jsx'
import { ChatThreadView } from './ChatThreadView.jsx'
import { chatKindLabelRu } from '../../lib/chat/chatAccessCore.js'
import { chatStaffReadOnlyRu } from '../../lib/chat/chatUiCore.js'
import { useStaffChatThread } from '../../hooks/useStaffChat.js'

/**
 * Шапка и лента переписки сотрудника с клиентом — панелью справа в «Сообщениях клуба» и страницей у админа (из карточки).
 * @param {{ clientId: string, kind: string, backTo: string, back?: import('react').ReactNode, onSent?: () => void }} props
 */
export function StaffChatPane({ clientId, kind, backTo, back = null, onSent }) {
  const chat = useStaffChatThread(clientId, kind)
  const [searchHost, setSearchHost] = useState(null)
  const meta = chat.meta
  const submit = async (...args) => {
    const sent = await chat.submit(...args)
    if (sent) onSent?.()
    return sent
  }
  return (
    <>
      <ChatHeadBar back={back} icon={MessageCircle} photo={meta?.client?.photo} title={meta?.client?.name || 'Клиент'} subtitle={chatKindLabelRu(kind)} searchHostRef={setSearchHost} />
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
          peerReadAt={meta?.peer_read_at}
          onSubmit={onSent ? submit : chat.submit}
          sending={chat.sending}
          sendError={chat.sendError}
          canWrite={Boolean(meta?.can_write)}
          readOnlyHint={chatStaffReadOnlyRu(meta)}
          emptyHint="Сообщений пока нет. Клиент увидит ваше сообщение в приложении клуба."
          placeholder="Ответ клиенту"
          searchHost={searchHost}
        />
      )}
    </>
  )
}
