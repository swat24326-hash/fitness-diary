import { Check, CheckCheck } from 'lucide-react'
import { chatTextParts } from '../../lib/chat/chatMessageCore.js'
import { buildChatFeed } from '../../lib/chat/chatFeedCore.js'
import { splitEmojiText } from '../../lib/chat/chatEmojiNotoCore.js'
import { ChatEmojiAnimated } from './ChatEmojiAnimated.jsx'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import { ChatSticker } from './stickers/ChatSticker.jsx'

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

function TextWithEmoji({ text }) {
  return splitEmojiText(text).map((p, i) =>
    p.key ? <ChatEmojiGlyph key={i} emoji={p.text} emojiKey={p.key} /> : <span key={i}>{p.text}</span>,
  )
}

function MessageText({ body }) {
  return chatTextParts(body).map((p, i) =>
    p.href ? (
      <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow">
        {p.text}
      </a>
    ) : (
      <TextWithEmoji key={i} text={p.text} />
    ),
  )
}

/** 1–3 смайлика без текста: анимация, как в Telegram; один — крупнее. */
function BigEmoji({ body }) {
  const parts = splitEmojiText(String(body ?? '').replace(/\s+/g, ''))
  return (
    <span className={`chat-big-emoji${parts.length === 1 ? ' chat-big-emoji--one' : ''}`}>
      {parts.map((p, i) => (p.key ? <ChatEmojiAnimated key={i} emoji={p.text} emojiKey={p.key} /> : <span key={i}>{p.text}</span>))}
    </span>
  )
}

function Meta({ m }) {
  const at = new Date(m.created_at)
  return (
    <span className="chat-msg__meta">
      <time dateTime={m.created_at}>{Number.isNaN(at.getTime()) ? '' : TIME_FMT.format(at)}</time>
      {m.mine ? (
        m.read ? (
          <CheckCheck size={15} aria-label="Прочитано" className="chat-msg__tick is-read" />
        ) : (
          <Check size={15} aria-label="Доставлено" className="chat-msg__tick" />
        )
      ) : null}
    </span>
  )
}

/**
 * Сообщения как в Telegram: плашки дней, пачки одного автора с «хвостиком» у последнего,
 * время и галочки внутри пузыря, крупные смайлики и стикеры без пузыря.
 * @param {{ messages: object[], peerReadAt?: string|null }} props
 */
export function ChatFeed({ messages, peerReadAt }) {
  return buildChatFeed(messages, { peerReadAt }).map((item) => {
    if (item.type === 'day') {
      return (
        <div key={item.key} className="chat-day" role="separator">
          <span>{item.label}</span>
        </div>
      )
    }
    const cls = [
      'chat-msg',
      item.mine && 'chat-msg--mine',
      item.groupStart && 'chat-msg--start',
      item.groupEnd && 'chat-msg--end',
      item.big && 'chat-msg--big',
      item.sticker && 'chat-msg--sticker',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <div key={item.id} className={cls}>
        {!item.mine && item.author_name && item.groupStart && !item.big ? (
          <span className="chat-msg__author">{item.author_name}</span>
        ) : null}
        <div className="chat-msg__body">
          {item.sticker ? (
            <ChatSticker id={item.sticker} />
          ) : item.big ? (
            <BigEmoji body={item.body} />
          ) : (
            <MessageText body={item.body} />
          )}
          <Meta m={item} />
        </div>
      </div>
    )
  })
}
