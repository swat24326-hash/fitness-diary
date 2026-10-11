import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import { ChatComposer } from './ChatComposer.jsx'
import { ChatFeed } from './ChatFeed.jsx'
import { attachChatStickToBottom, chatNewMessageAction, scrollChatToEnd } from '../../lib/chat/chatStickToBottom.js'

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
  const atBottomRef = useRef(true)
  const shownLastIdRef = useRef(undefined)
  const [newBelow, setNewBelow] = useState(false)
  const last = messages?.[messages.length - 1]
  const lastId = last?.id

  useEffect(
    () =>
      attachChatStickToBottom({
        onChange: (atBottom) => {
          atBottomRef.current = atBottom
          if (atBottom) setNewBelow(false)
        },
      }),
    [],
  )

  useEffect(() => {
    if (lastId == null) return
    const firstLoad = shownLastIdRef.current === undefined
    shownLastIdRef.current = lastId
    if (chatNewMessageAction({ firstLoad, mine: Boolean(last?.mine), atBottom: atBottomRef.current }) === 'scroll') {
      scrollChatToEnd(endRef.current)
    } else {
      setNewBelow(true)
    }
  }, [lastId])

  const newBelowButton = newBelow ? (
    <button
      type="button"
      className="chat-thread__new-below"
      data-testid="chat-new-below"
      onClick={() => scrollChatToEnd(endRef.current, 'smooth')}
    >
      <ChevronDown size={16} aria-hidden />
      Новые
    </button>
  ) : null

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
        <ChatComposer
          onSubmit={onSubmit}
          sending={sending}
          sendError={sendError}
          placeholder={placeholder}
          above={newBelowButton}
        />
      ) : readOnlyHint ? (
        <>
          {newBelowButton}
          <p className="chat-thread__readonly muted">{readOnlyHint}</p>
        </>
      ) : (
        newBelowButton
      )}
    </div>
  )
}
