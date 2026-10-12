import { useEffect, useState } from 'react'
import { notoEmojiKey } from '../../lib/chat/chatEmojiNotoCore.js'
import { chatReactionWhoRu } from '../../lib/chat/chatReactionCore.js'
import { useChatLongPress } from '../../hooks/useChatLongPress.js'
import { ChatEmojiAnimated } from './ChatEmojiAnimated.jsx'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import '../../styles/chat-reactions.css'

const WHO_MS = 2500

/** Не отдаём нажатие сообщению: его удержание открывает меню, а у плашки — «кто поставил». */
const own = (handlers) => ({
  ...handlers,
  onPointerDown: (e) => {
    e.stopPropagation()
    handlers.onPointerDown(e)
  },
  onContextMenu: (e) => {
    e.stopPropagation()
    handlers.onContextMenu(e)
  },
  onDoubleClick: (e) => e.stopPropagation(),
})

/** Поставил реакцию — крупный анимированный смайлик «вылетает» из плашки, как в Telegram. */
function Burst({ emoji }) {
  const key = notoEmojiKey(emoji)
  if (!key) return null
  return (
    <span className="chat-reactions__burst" aria-hidden>
      <ChatEmojiAnimated emoji={emoji} emojiKey={key} />
    </span>
  )
}

/**
 * Плашки реакций под сообщением. Своя подсвечена: тап — снять; чужая — поставить такую же.
 * Удержание плашки (на компьютере — наведение) — кто поставил. Без onReact (читает, но не пишет) — только показ.
 * @param {{ messageId: string, reactions: Array<{ emoji: string, count: number, mine: boolean, who?: string[] }>,
 *   onReact?: (id: string, emoji: string) => void, burst?: string|null }} props
 */
export function ChatReactions({ messageId, reactions, onReact, burst }) {
  const [whoOf, setWhoOf] = useState(null)
  const press = useChatLongPress((emoji) => setWhoOf(emoji))

  useEffect(() => {
    if (!whoOf) return undefined
    const t = window.setTimeout(() => setWhoOf(null), WHO_MS)
    return () => window.clearTimeout(t)
  }, [whoOf])

  if (!reactions?.length) return null
  return (
    <div className="chat-reactions" data-testid="chat-reactions">
      {reactions.map((r) => {
        const who = chatReactionWhoRu(r)
        const inner = (
          <>
            <ChatEmojiGlyph emoji={r.emoji} />
            {r.count > 1 ? <span className="chat-reactions__count">{r.count}</span> : null}
            {burst === r.emoji && r.mine ? <Burst emoji={r.emoji} /> : null}
            {whoOf === r.emoji && who ? (
              <span className="chat-reactions__who" role="tooltip">
                {who}
              </span>
            ) : null}
          </>
        )
        const cls = `chat-reactions__chip${r.mine ? ' is-mine' : ''}`
        return onReact ? (
          <button
            key={r.emoji}
            type="button"
            className={cls}
            title={who || undefined}
            aria-label={`${r.mine ? `Убрать реакцию ${r.emoji}` : `Поставить ${r.emoji}`}${who ? ` (${who})` : ''}`}
            aria-pressed={r.mine}
            {...own(press(r.emoji))}
            onClick={() => onReact(messageId, r.emoji)}
          >
            {inner}
          </button>
        ) : (
          <span key={r.emoji} className={cls} title={who || undefined} aria-label={`${r.emoji} ${r.count}${who ? ` (${who})` : ''}`} {...own(press(r.emoji))}>
            {inner}
          </span>
        )
      })}
    </div>
  )
}
