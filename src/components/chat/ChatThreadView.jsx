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
 *   onAtBottom?: (atBottom: boolean) => void, onReact?: (messageId: string, emoji: string) => void,
 *   reply?: { to: object|null, start: (message: object) => void, cancel: () => void },
 * }} props
 * reply — «Ответить» с цитатой (useChatThread().reply)
 * onAtBottom — внизу ли человек: «прочитано» ставим, только когда новое на экране (useChatThread)
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
  onAtBottom,
  onReact,
  reply,
}) {
  const endRef = useRef(null)
  const atBottomRef = useRef(true)
  const onAtBottomRef = useRef(onAtBottom)
  const shownLastIdRef = useRef(undefined)
  const [newBelow, setNewBelow] = useState(false)
  const last = messages?.[messages.length - 1]
  const lastId = last?.id
  onAtBottomRef.current = onAtBottom

  useEffect(
    () =>
      attachChatStickToBottom({
        onChange: (atBottom) => {
          atBottomRef.current = atBottom
          if (atBottom) setNewBelow(false)
          onAtBottomRef.current?.(atBottom)
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
        <ChatFeed
          messages={messages ?? []}
          peerReadAt={peerReadAt}
          onReact={canWrite ? onReact : undefined}
          onReply={canWrite ? reply?.start : undefined}
        />
        <div ref={endRef} />
      </div>

      {canWrite ? (
        <ChatComposer
          onSubmit={onSubmit}
          sending={sending}
          sendError={sendError}
          placeholder={placeholder}
          above={newBelowButton}
          replyTo={reply?.to ?? null}
          onCancelReply={reply?.cancel}
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
