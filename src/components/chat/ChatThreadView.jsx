import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, MessageCircle, Search } from 'lucide-react'
import { ChatComposer } from './ChatComposer.jsx'
import { ChatFeed } from './ChatFeed.jsx'
import { ChatSearchBar } from './ChatSearchBar.jsx'
import { useChatJump } from '../../hooks/useChatJump.js'
import { useChatSearch } from '../../hooks/useChatSearch.js'
import { attachChatStickToBottom, chatNewMessageAction, scrollChatToEnd } from '../../lib/chat/chatStickToBottom.js'
import '../../styles/chat-search.css'

/**
 * Лента диалога и поле ввода — общие для клиента (/me/chat) и сотрудника (/messages/chat).
 * @param {{
 *   messages: object[]|null, hasMore: boolean, onLoadOlder: () => void, peerReadAt?: string|null,
 *   onSubmit: (body: string) => Promise<boolean>, sending: boolean, sendError: string,
 *   canWrite?: boolean, readOnlyHint?: string, emptyHint: string, placeholder?: string,
 *   onAtBottom?: (atBottom: boolean) => void, onReact?: (messageId: string, emoji: string) => void,
 *   reply?: { to: object|null, start: (message: object) => void, cancel: () => void, find: (id: string) => Promise<boolean> },
 *   search?: (q: string) => Promise<{ results: object[] }>, dictate?: (audio: string) => Promise<{ text: string }>,
 * }} props
 * reply — «Ответить» с цитатой (useChatThread().reply); search — поиск по диалогу на сервере (лупа в углу ленты);
 * dictate — голос в текст для поля ввода (🎤)
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
  search,
  dictate,
}) {
  const endRef = useRef(null)
  const atBottomRef = useRef(true)
  const onAtBottomRef = useRef(onAtBottom)
  const shownLastIdRef = useRef(undefined)
  const [newBelow, setNewBelow] = useState(false)
  const jumper = useChatJump({ messages, find: reply?.find })
  const finder = useChatSearch({ search, jump: jumper.jump })
  const clearBackRef = useRef(jumper.clearBack)
  const last = messages?.[messages.length - 1]
  const lastId = last?.id
  onAtBottomRef.current = onAtBottom
  clearBackRef.current = jumper.clearBack

  useEffect(
    () =>
      attachChatStickToBottom({
        onChange: (atBottom) => {
          atBottomRef.current = atBottom
          if (atBottom) {
            setNewBelow(false)
            clearBackRef.current()
          }
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
  const backButton = jumper.canGoBack ? (
    <button type="button" className="chat-thread__back" aria-label="Назад к ответу" title="Назад к ответу" data-testid="chat-jump-back" onClick={jumper.back}>
      <ChevronDown size={22} aria-hidden />
    </button>
  ) : null
  const floating = (
    <>
      {newBelowButton}
      {backButton}
    </>
  )

  return (
    <div className="chat-thread">
      <div className="chat-thread__feed" aria-live="polite" data-testid="chat-feed">
        {finder.available && !finder.isOpen ? (
          <button type="button" className="chat-thread__search-toggle" aria-label="Поиск по переписке" title="Поиск по переписке" onClick={finder.open}>
            <Search size={18} aria-hidden />
          </button>
        ) : null}
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
          onJump={jumper.jump}
          finding={jumper.finding}
          highlight={finder.isOpen && finder.results?.length ? finder.query : ''}
        />
        <div ref={endRef} />
      </div>

      {finder.isOpen ? (
        <ChatSearchBar finder={finder} above={floating} />
      ) : canWrite ? (
        <ChatComposer
          onSubmit={onSubmit}
          sending={sending}
          sendError={sendError}
          placeholder={placeholder}
          dictate={dictate}
          above={floating}
          replyTo={reply?.to ?? null}
          onCancelReply={reply?.cancel}
        />
      ) : readOnlyHint ? (
        <>
          {floating}
          <p className="chat-thread__readonly muted">{readOnlyHint}</p>
        </>
      ) : (
        floating
      )}
    </div>
  )
}
