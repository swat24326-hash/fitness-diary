import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Copy, Reply } from 'lucide-react'
import { CHAT_EMOJI_SETS } from '../../lib/chat/chatEmojiCore.js'
import { frequentEmojis } from '../../lib/chat/chatEmojiFrequentCore.js'
import { readEmojiUsage } from '../../lib/chat/chatEmojiUsageStore.js'
import { CHAT_REACTIONS } from '../../lib/chat/chatReactionCore.js'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import '../../styles/chat-reactions.css'

const GAP = 8
const BAR_H = 56
const GRID_H = 320

/** Над сообщением, если сверху есть место, иначе под ним; не выходит за экран; к краю своей стороны. */
function placeOf(rect, mine, height) {
  const above = rect.top - height - GAP
  const top = above >= GAP ? above : Math.min(rect.bottom + GAP, window.innerHeight - height - GAP)
  const side = mine ? { right: Math.max(GAP, window.innerWidth - rect.right) } : { left: Math.max(GAP, rect.left) }
  return { top: Math.max(GAP, top), ...side }
}

function EmojiButton({ emoji, current, onPick, refEl }) {
  const mine = current === emoji
  return (
    <button
      ref={refEl}
      type="button"
      role="menuitem"
      className={`chat-react-menu__emoji${mine ? ' is-mine' : ''}`}
      aria-label={mine ? `Убрать реакцию ${emoji}` : `Реакция ${emoji}`}
      onClick={() => onPick(emoji)}
    >
      <ChatEmojiGlyph emoji={emoji} />
    </button>
  )
}

/** Весь набор, как в Telegram по стрелке: сначала «Часто используемые», потом разделы. */
function AllEmoji({ current, onPick }) {
  const [usage] = useState(readEmojiUsage)
  const sections = [{ id: 'frequent', label: 'Часто используемые', items: frequentEmojis(usage) }, ...CHAT_EMOJI_SETS]
  return (
    <div className="chat-react-menu__all" data-testid="chat-react-all">
      {sections.map((s) => (
        <section key={s.id} aria-label={s.label}>
          <h4 className="chat-react-menu__section">{s.label}</h4>
          <div className="chat-react-menu__grid">
            {s.items.map((e) => (
              <EmojiButton key={e} emoji={e} current={current} onPick={onPick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * Меню по долгому нажатию на сообщение: 6 реакций, стрелка «ещё» (весь набор), «Ответить» и «Копировать» для текста.
 * Рисовать с key по сообщению — у нового меню стрелка снова свёрнута.
 * @param {{ target: { id: string, rect: DOMRect, mine: boolean, text: string, current: string|null, message: object } | null,
 *   onPick: (id: string, emoji: string) => void, onReply?: (message: object) => void, onClose: () => void }} props
 */
export function ChatReactionMenu({ target, onPick, onReply, onClose }) {
  const firstRef = useRef(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!target) return undefined
    firstRef.current?.focus({ preventScroll: true })
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [target, onClose])

  if (!target) return null
  const pick = (emoji) => {
    onPick(target.id, emoji)
    onClose()
  }
  const reply = () => {
    onReply(target.message)
    onClose()
  }
  const copy = () => {
    void navigator.clipboard?.writeText(target.text).catch(() => {})
    onClose()
  }
  const height = expanded ? GRID_H : BAR_H
  return createPortal(
    <>
      <button type="button" className="chat-react-menu__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className={`chat-react-menu${expanded ? ' is-expanded' : ''}`}
        role="menu"
        aria-label="Реакция на сообщение"
        style={placeOf(target.rect, target.mine, height)}
        data-testid="chat-react-menu"
      >
        {expanded ? (
          <AllEmoji current={target.current} onPick={pick} />
        ) : (
          <>
            {CHAT_REACTIONS.map((emoji, i) => (
              <EmojiButton key={emoji} emoji={emoji} current={target.current} onPick={pick} refEl={i === 0 ? firstRef : undefined} />
            ))}
            <button type="button" className="chat-react-menu__more" aria-label="Все смайлики" title="Все смайлики" onClick={() => setExpanded(true)}>
              <ChevronDown size={18} aria-hidden />
            </button>
            {onReply && target.message ? (
              <button type="button" role="menuitem" className="chat-react-menu__copy" aria-label="Ответить" title="Ответить" onClick={reply}>
                <Reply size={18} aria-hidden />
              </button>
            ) : null}
            {target.text ? (
              <button type="button" role="menuitem" className="chat-react-menu__copy" aria-label="Копировать текст" title="Копировать" onClick={copy}>
                <Copy size={18} aria-hidden />
              </button>
            ) : null}
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
