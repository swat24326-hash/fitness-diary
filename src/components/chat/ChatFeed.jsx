import { Check, CheckCheck, Clock } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { chatLinkCheck, chatLinkNeedsConfirm } from '../../lib/chat/chatLinkCore.js'
import { chatTextParts } from '../../lib/chat/chatTextLinksCore.js'
import { buildChatFeed } from '../../lib/chat/chatFeedCore.js'
import { splitEmojiText } from '../../lib/chat/chatEmojiNotoCore.js'
import { CHAT_QUICK_REACTION, myChatReaction } from '../../lib/chat/chatReactionCore.js'
import { splitChatSearchMatches } from '../../lib/chat/chatSearchCore.js'
import { setVoiceQueue } from '../../lib/chat/chatVoicePlayback.js'
import { useChatLongPress } from '../../hooks/useChatLongPress.js'
import { ChatEmojiAnimated } from './ChatEmojiAnimated.jsx'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import { ChatLinkConfirm } from './ChatLinkConfirm.jsx'
import { ChatReactionMenu } from './ChatReactionMenu.jsx'
import { ChatReactions } from './ChatReactions.jsx'
import { ChatReplyQuote } from './ChatReplyQuote.jsx'
import { ChatSticker } from './stickers/ChatSticker.jsx'
import { ChatVoiceBubble } from './ChatVoiceBubble.jsx'

/** Пузырь фото / PDF и просмотр — отдельным куском сборки: основной бандл планшета ограничен (verify-project-health). */
const ChatAttachBubble = lazy(() => import('./ChatAttachBubble.jsx').then((m) => ({ default: m.ChatAttachBubble })))

/** Пока кусок грузится — место под фото уже занято, лента не прыгает. */
function AttachSlot({ attach }) {
  if (attach.kind === 'video' && !attach.expired) return <span className="chat-video" />
  if (attach.kind === 'sticker' && !attach.expired) {
    return <span className="chat-attach-sticker" style={{ aspectRatio: attach.w && attach.h ? `${attach.w} / ${attach.h}` : '1 / 1' }} />
  }
  if (attach.kind !== 'photo' || attach.expired) return <span className="chat-attach-slot" />
  return <span className="chat-attach-photo" style={{ aspectRatio: attach.w && attach.h ? `${attach.w} / ${attach.h}` : '4 / 3' }} />
}

const BURST_MS = 1200
const TIME_FMT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** Найденное поиском — подсвечено, как в Telegram. */
function Highlighted({ text, highlight }) {
  return splitChatSearchMatches(text, highlight).map((p, i) =>
    p.hit ? (
      <mark key={i} className="chat-search-hit">
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  )
}

function TextWithEmoji({ text, highlight }) {
  return splitEmojiText(text).map((p, i) =>
    p.key ? <ChatEmojiGlyph key={i} emoji={p.text} emojiKey={p.key} /> : <Highlighted key={i} text={p.text} highlight={highlight} />,
  )
}

function MessageText({ body, mine, onLink, highlight }) {
  const click = (e, href) => {
    const check = chatLinkCheck(href, window.location.origin)
    if (!chatLinkNeedsConfirm(check, mine)) return
    e.preventDefault()
    onLink(check)
  }
  return chatTextParts(body).map((p, i) =>
    p.kind === 'url' ? (
      <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => click(e, p.href)}>
        {p.text}
      </a>
    ) : p.href ? (
      <a key={i} href={p.href}>
        {p.text}
      </a>
    ) : (
      <TextWithEmoji key={i} text={p.text} highlight={highlight} />
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
        m.pending ? (
          <Clock size={13} aria-label="Ждёт сети" className="chat-msg__tick is-pending" data-testid="chat-msg-pending" />
        ) : m.read ? (
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
 * время и галочки внутри пузыря, крупные смайлики и стикеры без пузыря, реакции под сообщением.
 * onReact — может писать в диалог: долгое нажатие открывает реакции, «Ответить» и «Копировать», двойной тап — 👍,
 * свайп влево — «Ответить» (onReply). Нажали цитату — onJump(исходное, откуда) — useChatJump; finding — ищем его в истории.
 * highlight — запрос поиска: совпадения в тексте подсвечены. voice — звук и текст голосовых по id сообщения;
 * голосовые ленты по порядку — очередь общего плеера: доиграло одно — включается следующее собеседника.
 * @param {{ messages: object[], peerReadAt?: string|null, onReact?: (id: string, emoji: string) => void, onReply?: (message: object) => void,
 *   onJump?: (id: string, fromId: string) => void, finding?: string|null, highlight?: string,
 *   voice?: { audio: (id: string) => Promise<object>, text: (id: string) => Promise<object>, file?: (id: string) => Promise<object>, peerName?: string } | null,
 *   menuActions?: (message: object) => object[] }} props — menuActions: пункты списком в меню долгого нажатия (ChatReactionMenu)
 */
export function ChatFeed({ messages, peerReadAt, onReact, onReply, onJump, finding = null, highlight = '', voice = null, menuActions }) {
  const [link, setLink] = useState(null)
  const [menu, setMenu] = useState(null)
  const [burst, setBurst] = useState(null)
  const closeLink = useCallback(() => setLink(null), [])
  const closeMenu = useCallback(() => setMenu(null), [])
  const tracks = useMemo(() => {
    const out = new Map()
    if (!voice) return out
    for (const m of messages) {
      if (!m.voice) continue
      out.set(String(m.id), {
        key: String(m.id),
        sec: m.voice.sec,
        mine: Boolean(m.mine),
        expired: Boolean(m.voice.expired),
        once: Boolean(m.voice.once),
        title: m.mine ? 'Вы' : m.author_name || voice.peerName || 'Голосовое',
        load: () => voice.audio(m.id),
      })
    }
    return out
  }, [messages, voice])
  useEffect(() => {
    if (tracks.size) setVoiceQueue([...tracks.values()])
  }, [tracks])

  useEffect(() => {
    if (!burst) return undefined
    const t = window.setTimeout(() => setBurst(null), BURST_MS)
    return () => window.clearTimeout(t)
  }, [burst])

  /** Новая своя реакция — с «взрывом», снятая — тихо. */
  const react = useCallback(
    (id, emoji) => {
      const item = messages.find((m) => String(m.id) === String(id))
      if (myChatReaction(item?.reactions) !== emoji) setBurst({ id: String(id), emoji })
      onReact(id, emoji)
    },
    [messages, onReact],
  )
  const press = useChatLongPress(
    (item, el) =>
      setMenu({
        id: item.id,
        rect: el.getBoundingClientRect(),
        mine: item.mine,
        text: item.voice ? (item.voice.text ?? '') : item.attach ? item.attach.caption : item.sticker ? '' : String(item.body ?? ''),
        current: myChatReaction(item.reactions),
        message: item,
      }),
    (item) => react(item.id, CHAT_QUICK_REACTION),
    onReply,
  )
  const items = buildChatFeed(messages, { peerReadAt }).map((item) => {
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
      item.voice && voice && 'chat-msg--voice',
      item.attach && voice?.file && `chat-msg--attach chat-msg--${item.attach.kind}`,
      onReact && !item.pending && 'chat-msg--pressable',
      item.pending && 'chat-msg--pending',
      menu?.id === item.id && 'is-pressed',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <div key={item.id} className={cls} data-msg-id={item.id} {...(onReact && !item.pending ? press(item) : {})}>
        {!item.mine && item.author_name && item.groupStart && !item.big ? (
          <span className="chat-msg__author">{item.author_name}</span>
        ) : null}
        <div className="chat-msg__body">
          {item.reply ? (
            <ChatReplyQuote quote={item.reply} onJump={(id) => onJump?.(id, item.id)} busy={finding === String(item.reply.id)} />
          ) : null}
          {item.sticker ? (
            <ChatSticker id={item.sticker} />
          ) : item.attach && voice?.file ? (
            <>
              <Suspense fallback={<AttachSlot attach={item.attach} />}>
                <ChatAttachBubble id={item.id} attach={item.attach} load={voice.file} />
              </Suspense>
              {item.attach.caption ? (
                <p className="chat-attach-caption">
                  <MessageText body={item.attach.caption} mine={item.mine} onLink={setLink} highlight={highlight} />
                </p>
              ) : null}
            </>
          ) : item.voice && voice ? (
            <ChatVoiceBubble track={tracks.get(String(item.id))} voice={item.voice} loadText={() => voice.text(item.id)} />
          ) : item.big ? (
            <BigEmoji body={item.body} />
          ) : (
            <MessageText body={item.body} mine={item.mine} onLink={setLink} highlight={highlight} />
          )}
          <Meta m={item} />
        </div>
        <ChatReactions
          messageId={item.id}
          reactions={item.reactions}
          onReact={onReact && !item.pending ? react : undefined}
          burst={burst?.id === String(item.id) ? burst.emoji : null}
        />
      </div>
    )
  })
  return (
    <>
      {items}
      <ChatLinkConfirm link={link} onClose={closeLink} />
      {onReact ? <ChatReactionMenu key={menu?.id ?? ''} target={menu} onPick={react} onReply={onReply} onClose={closeMenu} actions={menuActions} /> : null}
    </>
  )
}
