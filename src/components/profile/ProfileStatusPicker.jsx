import { useState } from 'react'
import { PROFILE_STATUS_DURATIONS, PROFILE_STATUS_EMOJIS, profileStatusUntilRu } from '../../lib/profile/profileStatusCore.js'
import { ProfileStatusMark } from './ProfileStatusMark.jsx'
import { ChatEmojiGlyph } from '../chat/ChatEmojiGlyph.jsx'
import '../../styles/profile-status.css'

/**
 * «Статус рядом с именем» в «Мой профиль», как эмодзи-статус Telegram: сначала срок, касание смайлика — сразу сохраняет.
 * @param {{ avatar: ReturnType<typeof import('../../hooks/useMyAvatar.js').useMyAvatar> }} props
 */
export function ProfileStatusPicker({ avatar }) {
  const [duration, setDuration] = useState('today')
  const current = avatar.status
  return (
    <section className="profile-status" aria-label="Статус рядом с именем" data-testid="profile-status">
      <div className="profile-status__head">
        <h3 className="profile-status__title">Статус рядом с именем</h3>
        {current ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={avatar.busy} onClick={() => void avatar.setStatus(null)} data-testid="profile-status-clear">
            Убрать
          </button>
        ) : null}
      </div>
      <small className="profile-status__until" data-testid="profile-status-current">
        {current ? (
          <>
            Сейчас <ProfileStatusMark emoji={current.emoji} /> {profileStatusUntilRu(current.until)}
          </>
        ) : (
          'Смайлик видят в переписке рядом с вашим именем'
        )}
      </small>
      <div className="profile-status__durations" role="group" aria-label="На сколько">
        {PROFILE_STATUS_DURATIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`btn btn-sm ${duration === d.id ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={duration === d.id}
            onClick={() => setDuration(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="profile-status__grid">
        {PROFILE_STATUS_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`profile-status__emoji${current?.emoji === emoji ? ' is-active' : ''}`}
            aria-label={`Статус ${emoji}`}
            disabled={avatar.busy}
            onClick={() => void avatar.setStatus(emoji, duration)}
          >
            <ChatEmojiGlyph emoji={emoji} className="profile-status-mark__glyph" />
          </button>
        ))}
      </div>
    </section>
  )
}
