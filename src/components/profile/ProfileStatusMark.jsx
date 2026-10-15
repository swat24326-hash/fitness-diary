import { ChatEmojiGlyph } from '../chat/ChatEmojiGlyph.jsx'
import '../../styles/profile-status.css'

/**
 * Смайлик-статус сразу после имени, как в Telegram (правило — profileStatusCore.js; null — ничего).
 * @param {{ emoji?: string|null }} props
 */
export function ProfileStatusMark({ emoji = null }) {
  if (!emoji) return null
  return (
    <span className="profile-status-mark" role="img" aria-label={`Статус ${emoji}`} title="Статус" data-testid="profile-status-mark">
      <ChatEmojiGlyph emoji={emoji} className="profile-status-mark__glyph" />
    </span>
  )
}
