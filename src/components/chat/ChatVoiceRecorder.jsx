import { ChevronLeft, ChevronUp, Lock, Mic, Square } from 'lucide-react'
import { formatVoiceTime, isVoiceEnding, voiceCancelProgress, voiceLockProgress } from '../../lib/chat/chatVoiceCore.js'
import { ChatVoiceReview } from './ChatVoiceReview.jsx'
import { ChatVoiceSendButton } from './ChatVoiceSendButton.jsx'

const LIVE_BARS = 32

function LiveWave({ levels }) {
  const bars = Array.from({ length: LIVE_BARS }, (_, i) => levels[i - (LIVE_BARS - levels.length)] ?? 0)
  return (
    <span className="chat-voice-rec__wave" aria-hidden>
      {bars.map((level, i) => (
        <i key={i} style={{ transform: `scaleY(${Math.max(0.12, level)})` }} />
      ))}
    </span>
  )
}

function Timer({ seconds }) {
  return (
    <>
      <span className="chat-voice-rec__dot" aria-hidden />
      <span className={`chat-voice-rec__time${isVoiceEnding(seconds) ? ' is-ending' : ''}`} aria-live="off" data-testid="chat-voice-time">
        {formatVoiceTime(seconds)}
      </span>
    </>
  )
}

/**
 * Внутри капсулы поля вместо текста. Держим: ● 0:07 · «‹ Влево — отмена» (едет за пальцем).
 * Без рук: ● 0:07 · волна · «Отмена». Пауза: 🗑 · ▶ · волна с ручками обрезки (ChatVoiceReview).
 * @param {{ rec: ReturnType<typeof import('../../hooks/useChatVoiceRecord.js').useChatVoiceRecord> }} props
 */
export function ChatVoicePanel({ rec }) {
  if (rec.phase === 'holding') {
    const pull = voiceCancelProgress(rec.dx)
    return (
      <div className="chat-voice-rec" data-testid="chat-voice-holding">
        <Timer seconds={rec.seconds} />
        <span
          className="chat-voice-rec__slide"
          style={{ transform: `translateX(${Math.min(0, rec.dx) * 0.6}px)`, opacity: 1 - pull * 0.7 }}
        >
          <ChevronLeft size={16} aria-hidden />
          Влево — отмена
        </span>
      </div>
    )
  }
  if (rec.phase === 'locked') {
    return (
      <div className="chat-voice-rec" data-testid="chat-voice-locked">
        <Timer seconds={rec.seconds} />
        <LiveWave levels={rec.levels} />
        <button type="button" className="chat-voice-rec__cancel" onClick={rec.cancel} data-testid="chat-voice-cancel">
          Отмена
        </button>
      </div>
    )
  }
  if ((rec.phase === 'review' || rec.phase === 'sending') && rec.result) return <ChatVoiceReview rec={rec} />
  return null
}

/**
 * Круглая кнопка справа, пока поле пустое. Тот же элемент от нажатия до отпускания — палец не теряется.
 * Держим: кнопка растёт с громкостью, над ней замок «вверх — без рук». Без рук: ■ «пауза» и «Отправить»;
 * на паузе: 🎤 «дописать» (если не 5:00) и «Отправить» (подержать — без звука). Выше всех — «1»: одноразовое.
 * @param {{ rec: ReturnType<typeof import('../../hooks/useChatVoiceRecord.js').useChatVoiceRecord> }} props
 */
export function ChatVoiceButton({ rec }) {
  const { phase } = rec
  if (phase === 'idle' || phase === 'holding') {
    const holding = phase === 'holding'
    const level = rec.levels[rec.levels.length - 1] ?? 0
    const lift = voiceLockProgress(rec.dy)
    return (
      <div className="chat-voice-btn">
        {holding ? (
          <span className="chat-voice-btn__lock" style={{ transform: `translateY(${-lift * 24}px)` }} aria-hidden>
            <Lock size={16} />
            <ChevronUp size={14} />
          </span>
        ) : null}
        <button
          key="mic"
          type="button"
          className={`chat-compose__send chat-voice-btn__mic${holding ? ' is-holding' : ''}`}
          style={holding ? { '--voice-level': level } : undefined}
          aria-label="Голосовое — удерживайте"
          title="Голосовое — удерживайте"
          data-testid="chat-mic"
          onContextMenu={(e) => e.preventDefault()}
          {...rec.press}
        >
          <Mic size={22} aria-hidden />
        </button>
      </div>
    )
  }
  return (
    <div className="chat-voice-btn">
      <button
        type="button"
        className={`chat-voice-btn__once${rec.once ? ' is-on' : ''}`}
        aria-pressed={rec.once}
        aria-label="Одноразовое — прослушают один раз"
        title="Одноразовое — прослушают один раз"
        onClick={rec.toggleOnce}
        disabled={phase === 'sending'}
        data-testid="chat-voice-once"
      >
        1
      </button>
      {phase === 'locked' ? (
        <button
          type="button"
          className="chat-voice-btn__stop"
          aria-label="Пауза — прослушать"
          title="Пауза — прослушать"
          onClick={() => void rec.review()}
          data-testid="chat-voice-stop"
        >
          <Square size={14} aria-hidden />
        </button>
      ) : phase === 'review' && rec.live ? (
        <button
          type="button"
          className="chat-voice-btn__stop chat-voice-btn__resume"
          aria-label="Продолжить запись"
          title="Продолжить запись"
          onClick={() => void rec.resume()}
          data-testid="chat-voice-resume"
        >
          <Mic size={16} aria-hidden />
        </button>
      ) : null}
      <ChatVoiceSendButton sending={phase === 'sending'} onSend={(opts) => void rec.finish(opts)} />
    </div>
  )
}
