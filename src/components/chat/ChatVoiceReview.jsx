import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { formatVoiceTime, voiceSeekRatio } from '../../lib/chat/chatVoiceCore.js'
import { voicePreviewBlob } from '../../lib/chat/chatVoiceParts.js'
import { trimmedVoiceSec } from '../../lib/chat/chatVoiceTrimCore.js'
import { useChatVoicePlayer } from '../../hooks/useChatVoicePlayer.js'
import { ChatVoicePlayIcon, ChatVoiceWave } from './ChatVoiceBubble.jsx'

/** Ручка обрезки: тянуть пальцем или мышью; жест не уходит в ленту и не листает страницу. */
function TrimHandle({ side, at, onMove, disabled }) {
  const move = (e) => {
    const box = e.currentTarget.parentElement.getBoundingClientRect()
    onMove(voiceSeekRatio(e.clientX - box.left, box.width))
  }
  return (
    <span
      className={`chat-voice-trim__handle chat-voice-trim__handle--${side}`}
      style={side === 'start' ? { left: `${at * 100}%` } : { right: `${(1 - at) * 100}%` }}
      role="slider"
      aria-label={side === 'start' ? 'Начало записи' : 'Конец записи'}
      aria-valuenow={Math.round(at * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-disabled={disabled}
      data-testid={`chat-voice-trim-${side}`}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (disabled) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (!disabled && e.currentTarget.hasPointerCapture?.(e.pointerId)) move(e)
      }}
      onPointerUp={(e) => e.stopPropagation()}
    />
  )
}

/**
 * Пауза записи, как в Telegram: 🗑 · ▶ своей записи · волна с ручками по краям (лишнее режется при отправке) · время.
 * 🎤 «дописать» и «Отправить» — справа (ChatVoiceButton).
 * @param {{ rec: ReturnType<typeof import('../../hooks/useChatVoiceRecord.js').useChatVoiceRecord> }} props
 */
export function ChatVoiceReview({ rec }) {
  const { result } = rec
  const { sec, wave } = result
  const { trim, previewKey } = rec
  const sending = rec.phase === 'sending'
  const track = useMemo(
    () => ({ key: previewKey, sec, preview: true, mine: true, range: trim, load: () => voicePreviewBlob(result).then((blob) => ({ blob })) }),
    [previewKey, sec, result, trim],
  )
  const player = useChatVoicePlayer(track)
  const active = player.status === 'playing' || player.status === 'paused'
  const inRange = (r) => Math.max(trim[0], Math.min(trim[1], r))

  return (
    <div className="chat-voice-rec chat-voice-rec--review" data-testid="chat-voice-review">
      <button
        type="button"
        className="chat-voice-rec__trash"
        aria-label="Удалить запись"
        title="Удалить"
        onClick={rec.cancel}
        disabled={sending}
        data-testid="chat-voice-delete"
      >
        <Trash2 size={20} aria-hidden />
      </button>
      <button
        type="button"
        className="chat-voice__play chat-voice-rec__play"
        onClick={() => void player.toggle()}
        aria-label={player.status === 'playing' ? 'Пауза' : 'Прослушать'}
        data-testid="chat-voice-preview-play"
      >
        <ChatVoicePlayIcon status={player.status} />
      </button>
      <div className="chat-voice-trim">
        <ChatVoiceWave wave={wave} progress={active ? player.progress : trim[0]} onSeek={(r, o) => player.seek(inRange(r), o)} range={trim} />
        <TrimHandle side="start" at={trim[0]} disabled={sending} onMove={(r) => rec.setTrim([r, trim[1]])} />
        <TrimHandle side="end" at={trim[1]} disabled={sending} onMove={(r) => rec.setTrim([trim[0], r])} />
      </div>
      <span className="chat-voice-rec__time" data-testid="chat-voice-time">
        {formatVoiceTime(active ? (player.progress - trim[0]) * sec : trimmedVoiceSec(sec, trim))}
      </span>
    </div>
  )
}
