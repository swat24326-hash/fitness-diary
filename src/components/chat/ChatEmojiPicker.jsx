import { useState } from 'react'
import { Apple, Clock, Flag, Heart, Leaf, Lightbulb, Plane, Smile, Sticker, Trophy } from 'lucide-react'
import { CHAT_EMOJI_SETS } from '../../lib/chat/chatEmojiCore.js'
import { frequentEmojis, orderStickersByUse } from '../../lib/chat/chatEmojiFrequentCore.js'
import { readEmojiUsage } from '../../lib/chat/chatEmojiUsageStore.js'
import { CHAT_STICKERS } from '../../lib/chat/chatStickerCore.js'
import { ChatEmojiGlyph } from './ChatEmojiGlyph.jsx'
import { ChatSticker } from './stickers/ChatSticker.jsx'

const SET_ICON = {
  frequent: Clock,
  stickers: Sticker,
  smileys: Smile,
  nature: Leaf,
  food: Apple,
  activity: Trophy,
  travel: Plane,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
}

/**
 * Панель над полем ввода (как в Telegram): «Часто используемые», стикеры клуба (частые — первыми), наборы смайликов.
 * Смайлик вставляется в текст, стикер отправляется сразу. Частоту считает отправка (chatEmojiUsageStore).
 * @param {{ onPick: (emoji: string) => void, onSticker: (id: string) => void, sending: boolean }} props
 */
export function ChatEmojiPicker({ onPick, onSticker, sending }) {
  const [usage] = useState(readEmojiUsage)
  const tabs = [
    { id: 'frequent', label: 'Часто используемые', items: frequentEmojis(usage) },
    { id: 'stickers', label: 'Стикеры', items: [] },
    ...CHAT_EMOJI_SETS,
  ]
  const [tabId, setTabId] = useState(tabs[0].id)
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]

  return (
    <div className="chat-emoji" role="dialog" aria-label="Смайлики и стикеры" data-testid="chat-emoji-picker">
      <div className="chat-emoji__tabs" role="tablist">
        {tabs.map((t) => {
          const Icon = SET_ICON[t.id] ?? Smile
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab.id}
              className={`chat-emoji__tab${t.id === tab.id ? ' is-active' : ''}`}
              title={t.label}
              aria-label={t.label}
              onClick={() => setTabId(t.id)}
            >
              <Icon size={20} aria-hidden />
            </button>
          )
        })}
      </div>
      {tab.id === 'stickers' ? (
        <div className="chat-emoji__grid chat-emoji__grid--stickers" role="tabpanel" aria-label={tab.label}>
          {orderStickersByUse(CHAT_STICKERS, usage).map((s) => (
            <button
              key={s.id}
              type="button"
              className="chat-emoji__sticker"
              disabled={sending}
              onClick={() => onSticker(s.id)}
              aria-label={`Отправить стикер «${s.label}»`}
            >
              <ChatSticker id={s.id} size="pick" />
            </button>
          ))}
        </div>
      ) : (
        <div className="chat-emoji__grid" role="tabpanel" aria-label={tab.label}>
          {tab.items.map((e) => (
            <button key={e} type="button" className="chat-emoji__item" onClick={() => onPick(e)} aria-label={e}>
              <ChatEmojiGlyph emoji={e} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
