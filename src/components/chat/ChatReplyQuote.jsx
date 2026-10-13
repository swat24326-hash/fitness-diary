import { Reply, X } from 'lucide-react'
import { splitEmojiText } from '../../lib/chat/chatEmojiNotoCore.js'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import '../../styles/chat-reply.css'

function QuoteText({ text }) {
  return splitEmojiText(text).map((p, i) =>
    p.key ? <ChatEmojiGlyph key={i} emoji={p.text} emojiKey={p.key} /> : <span key={i}>{p.text}</span>,
  )
}

/**
 * Цитата, как в Telegram: полоска слева, кто и первая строка.
 * В пузыре — кнопка «к исходному» (onJump); над полем ввода — «Ответ …» с крестиком (onCancel).
 * busy — ищем старое исходное в истории: цитата мигает, повторное нажатие не запускает второй поиск.
 * @param {{ quote: { id: string, who: string, text: string }, onJump?: (id: string) => void, onCancel?: () => void, busy?: boolean }} props
 */
export function ChatReplyQuote({ quote, onJump, onCancel, busy = false }) {
  if (!quote) return null
  if (onCancel) {
    return (
      <div className="chat-reply chat-reply--compose" data-testid="chat-reply-draft">
        <Reply size={18} aria-hidden className="chat-reply__icon" />
        <div className="chat-reply__quote">
          <span className="chat-reply__who">{quote.who ? `Ответ ${quote.who}` : 'Ответ'}</span>
          <span className="chat-reply__text">
            <QuoteText text={quote.text} />
          </span>
        </div>
        <button type="button" className="chat-reply__cancel" aria-label="Не отвечать" title="Не отвечать" onClick={onCancel}>
          <X size={18} aria-hidden />
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      className={`chat-reply chat-reply__quote${busy ? ' is-busy' : ''}`}
      data-testid="chat-reply-quote"
      aria-busy={busy || undefined}
      title={busy ? 'Ищу сообщение в истории…' : undefined}
      aria-label={`Ответ на сообщение ${quote.who}: ${quote.text}`}
      onClick={() => onJump?.(quote.id)}
    >
      {quote.who ? <span className="chat-reply__who">{quote.who}</span> : null}
      <span className="chat-reply__text">
        <QuoteText text={quote.text} />
      </span>
    </button>
  )
}
