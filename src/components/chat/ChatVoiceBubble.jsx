import { useState } from 'react'
import { Loader2, MicOff, Pause, Play } from 'lucide-react'
import {
  CHAT_VOICE_EXPIRED_RU,
  CHAT_VOICE_ONCE_PLAYED_RU,
  CHAT_VOICE_TEXT_EMPTY_RU,
  formatVoiceTime,
  voiceSeekRatio,
} from '../../lib/chat/chatVoiceCore.js'
import { useChatVoicePlayer } from '../../hooks/useChatVoicePlayer.js'
import { useChatVoiceText } from '../../hooks/useChatVoiceText.js'
import '../../styles/chat-voice.css'

const KEY_STEP = 0.05

/**
 * Волна: нажатие — перемотка, палец тянет — перематывает на ходу, как в Telegram. Жест не уходит в ленту
 * (иначе потянуть вбок = «Ответить», подержать = меню реакций). Стрелки с клавиатуры — ±5%.
 */
export function ChatVoiceWave({ wave, progress, onSeek, range = null }) {
  const [drag, setDrag] = useState(null)
  const ratioAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    return voiceSeekRatio(e.clientX - r.left, r.width)
  }
  const shown = drag ?? progress
  const played = Math.round(shown * wave.length)
  const outside = (i) => range && (i < Math.floor(range[0] * wave.length) || i >= Math.ceil(range[1] * wave.length))
  return (
    <button
      type="button"
      className="chat-voice__wave"
      disabled={!onSeek}
      aria-label="Перемотать"
      onPointerDown={(e) => {
        e.stopPropagation()
        if (!onSeek || (e.button ?? 0) !== 0) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setDrag(ratioAt(e))
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        if (drag == null) return
        const r = ratioAt(e)
        setDrag(r)
        onSeek(r, { resume: false })
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        if (drag == null) return
        onSeek(ratioAt(e))
        setDrag(null)
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        onSeek(Math.max(0, Math.min(1, progress + (e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP))))
      }}
    >
      {wave.map((v, i) => (
        <span
          key={i}
          className={[i < played && 'is-played', outside(i) && 'is-cut'].filter(Boolean).join(' ')}
          style={{ height: `${Math.max(12, v)}%` }}
        />
      ))}
    </button>
  )
}

function Transcript({ text }) {
  return <p className={`chat-voice__text${text ? '' : ' is-empty'}`}>{text || CHAT_VOICE_TEXT_EMPTY_RU}</p>
}

/** «1» — одноразовое, как в Telegram: badge — уголком на кнопке ▶. */
export function OnceMark({ badge = false }) {
  return (
    <span className={`chat-voice__once${badge ? ' chat-voice__once--badge' : ''}`} aria-hidden>
      1
    </span>
  )
}

export function ChatVoicePlayIcon({ status }) {
  if (status === 'loading') return <Loader2 size={18} className="chat-voice__spin" />
  return status === 'playing' ? <Pause size={18} /> : <Play size={18} />
}

/**
 * Голосовое в ленте, как в Telegram: ▶, волна (нажатие и перетаскивание — перемотка), время, скорость 1x/1.5x/2x,
 * «→ Аа» — текстом, синяя точка — собеседник ещё не слушал. Играет общий плеер: ушли из диалога — играет дальше.
 * Через сутки звук удалён — остаются длительность и текст, если расшифровывали.
 * Одноразовое («1»): собеседник слушает раз, без перемотки и «→ Аа»; автор его не слушает; прослушали — «прослушано» у обоих.
 * @param {{ track: import('../../lib/chat/chatVoicePlayback.js').VoiceTrack,
 *   voice: { sec: number, wave: number[], text?: string|null, expired?: boolean, played?: boolean, once?: boolean },
 *   loadText?: () => Promise<{ done: boolean, text?: string }> }} props
 */
export function ChatVoiceBubble({ track, voice, loadText }) {
  const player = useChatVoicePlayer(track)
  const transcript = useChatVoiceText({ initial: voice.text ?? null, load: loadText })
  const started = player.status === 'playing' || player.status === 'paused' || player.progress > 0
  const shown = started ? player.progress * voice.sec : voice.sec
  const hasText = transcript.text != null
  const unplayed = !track.preview && !voice.played && !(player.played && !track.mine)
  const once = Boolean(voice.once)

  if (voice.expired || (once && player.consumed)) {
    return (
      <div className="chat-voice chat-voice--expired" data-testid={once ? 'chat-voice-once-gone' : undefined}>
        <div className="chat-voice__row">
          <span className="chat-voice__play" aria-hidden>
            {once ? <OnceMark /> : <MicOff size={18} />}
          </span>
          <span className="chat-voice__gone">
            {once ? CHAT_VOICE_ONCE_PLAYED_RU : CHAT_VOICE_EXPIRED_RU} · {formatVoiceTime(voice.sec)}
          </span>
        </div>
        {hasText ? <Transcript text={transcript.text} /> : null}
      </div>
    )
  }

  if (once && track.mine) {
    return (
      <div className="chat-voice chat-voice--expired" data-testid="chat-voice-once-mine">
        <div className="chat-voice__row">
          <span className="chat-voice__play" aria-hidden>
            <OnceMark />
          </span>
          <span className="chat-voice__gone">
            Одноразовое голосовое · {formatVoiceTime(voice.sec)}
            {unplayed ? <span className="chat-voice__dot" role="img" aria-label="Не прослушано" data-testid="chat-voice-unplayed" /> : null}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`chat-voice${once ? ' chat-voice--once' : ''}`}>
      <div className="chat-voice__row">
        <button
          type="button"
          className="chat-voice__play"
          onClick={() => void player.toggle()}
          aria-label={player.status === 'playing' ? 'Пауза' : once ? 'Слушать один раз' : 'Слушать'}
          data-testid={once ? 'chat-voice-once-play' : undefined}
        >
          <ChatVoicePlayIcon status={player.status} />
          {once ? <OnceMark badge /> : null}
        </button>
        <div className="chat-voice__track">
          <ChatVoiceWave wave={voice.wave} progress={player.progress} onSeek={once ? null : player.seek} range={track.range ?? null} />
          <div className="chat-voice__under">
            <span className="chat-voice__time">{formatVoiceTime(shown)}</span>
            {unplayed ? <span className="chat-voice__dot" role="img" aria-label="Не прослушано" data-testid="chat-voice-unplayed" /> : null}
            {player.status === 'playing' || player.status === 'paused' ? (
              <button type="button" className="chat-voice__chip" onClick={player.cycleSpeed} aria-label="Скорость">
                {player.speed}x
              </button>
            ) : null}
            {once && player.status === 'idle' ? <span className="chat-voice__once-hint">Один раз</span> : null}
            {loadText && !hasText && !once ? (
              <button
                type="button"
                className="chat-voice__chip"
                onClick={() => void transcript.request()}
                disabled={transcript.busy}
                aria-label="Показать текстом"
              >
                {transcript.busy ? <Loader2 size={12} className="chat-voice__spin" /> : '→ Аа'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {hasText ? <Transcript text={transcript.text} /> : null}
      {player.error || transcript.error ? (
        <p className="chat-voice__error" role="alert">
          {player.error || transcript.error}
        </p>
      ) : null}
    </div>
  )
}
