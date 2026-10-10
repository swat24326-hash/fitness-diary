import { useState } from 'react'
import { Apple, Clock, Dumbbell, Hand, Smile, Sticker } from 'lucide-react'
import { CHAT_EMOJI_SETS, pushRecentEmoji } from '../../lib/chat/chatEmojiCore.js'
import { CHAT_STICKERS } from '../../lib/chat/chatStickerCore.js'
import { ChatSticker } from './stickers/ChatSticker.jsx'

const RECENT_KEY = 'fd_chat_recent_emoji'
const SET_ICON = { stickers: Sticker, smiles: Smile, gestures: Hand, sport: Dumbbell, food: Apple }

function readRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(v) ? v.filter((e) => typeof e === 'string') : []
  } catch {
    return []
  }
}

/**
 * Панель над полем ввода (как в Telegram): стикеры клуба, наборы смайликов и «Недавние».
 * Смайлик вставляется в текст, стикер отправляется сразу.
 * @param {{ onPick: (emoji: string) => void, onSticker: (id: string) => void, sending: boolean }} props
 */
export function ChatEmojiPicker({ onPick, onSticker, sending }) {
  const [recent, setRecent] = useState(readRecent)
  const tabs = [
    ...(recent.length ? [{ id: 'recent', label: 'Недавние', items: recent }] : []),
    { id: 'stickers', label: 'Стикеры', items: [] },
    ...CHAT_EMOJI_SETS,
  ]
  const [tabId, setTabId] = useState(tabs[0].id)
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0]

  function pick(emoji) {
    const next = pushRecentEmoji(recent, emoji)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* приватный режим — недавние только до перезагрузки */
    }
    onPick(emoji)
  }

  return (
    <div className="chat-emoji" role="dialog" aria-label="Смайлики и стикеры" data-testid="chat-emoji-picker">
      <div className="chat-emoji__tabs" role="tablist">
        {tabs.map((t) => {
          const Icon = t.id === 'recent' ? Clock : SET_ICON[t.id] ?? Smile
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
          {CHAT_STICKERS.map((s) => (
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
            <button key={e} type="button" className="chat-emoji__item" onClick={() => pick(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
