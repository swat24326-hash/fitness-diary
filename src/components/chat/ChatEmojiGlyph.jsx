import { useState } from 'react'
import { notoEmojiKey, notoEmojiStaticUrl } from '../../lib/chat/chatEmojiNotoCore.js'
import '../../styles/chat-emoji.css'

/**
 * Смайлик картинкой Noto (одинаково на всех телефонах); нет в каталоге или картинка не загрузилась — символ.
 * @param {{ emoji: string, emojiKey?: string|null, className?: string, loading?: 'lazy' | 'eager' }} props
 */
export function ChatEmojiGlyph({ emoji, emojiKey, className = 'chat-emoji-glyph', loading = 'lazy' }) {
  const key = emojiKey ?? notoEmojiKey(emoji)
  const [failed, setFailed] = useState(false)
  if (!key || failed) return <span className={`${className} ${className}--text`}>{emoji}</span>
  return (
    <img
      className={className}
      src={notoEmojiStaticUrl(key)}
      alt={emoji}
      draggable={false}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
