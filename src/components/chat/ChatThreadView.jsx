import { useEffect, useRef } from 'react'
import { ChevronUp, MessageCircle } from 'lucide-react'
import { ChatComposer } from './ChatComposer.jsx'
import { ChatFeed } from './ChatFeed.jsx'

/**
 * Лента диалога и поле ввода — общие для клиента (/me/chat) и сотрудника (/messages/chat).
 * @param {{
 *   messages: object[]|null, hasMore: boolean, onLoadOlder: () => void, peerReadAt?: string|null,
 *   onSubmit: (body: string) => Promise<boolean>, sending: boolean, sendError: string,
 *   canWrite?: boolean, readOnlyHint?: string, emptyHint: string, placeholder?: string,
 * }} props
 */
export function ChatThreadView({
  messages,
  hasMore,
  onLoadOlder,
  peerReadAt = null,
  onSubmit,
  sending,
  sendError,
  canWrite = true,
  readOnlyHint = '',
  emptyHint,
  placeholder = 'Сообщение',
}) {
  const endRef = useRef(null)
  const lastId = messages?.[messages.length - 1]?.id

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lastId])

  return (
    <div className="chat-thread">
      <div className="chat-thread__feed" aria-live="polite" data-testid="chat-feed">
        {hasMore ? (
          <button type="button" className="chat-thread__older" onClick={onLoadOlder}>
            <ChevronUp size={16} aria-hidden />
            Раньше
          </button>
        ) : null}
        {messages && !messages.length ? (
          <div className="chat-thread__empty">
            <MessageCircle size={28} aria-hidden />
            <p>{emptyHint}</p>
          </div>
        ) : null}
        <ChatFeed messages={messages ?? []} peerReadAt={peerReadAt} />
        <div ref={endRef} />
      </div>

      {canWrite ? (
        <ChatComposer onSubmit={onSubmit} sending={sending} sendError={sendError} placeholder={placeholder} />
      ) : readOnlyHint ? (
        <p className="chat-thread__readonly muted">{readOnlyHint}</p>
      ) : null}
    </div>
  )
}
