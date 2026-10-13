import { X } from 'lucide-react'
import { CHAT_DICTATION_BARS, CHAT_DICTATION_MAX_SEC, formatDictationTime } from '../../lib/chat/chatDictationCore.js'
import '../../styles/chat-dictation.css'

const WARN_LEFT_SEC = 5

/**
 * Внутри капсулы поля, пока идёт голосовой ввод: × отмена · ● таймер · волна; потом «Распознаю…».
 * @param {{ dictation: ReturnType<typeof import('../../hooks/useChatDictation.js').useChatDictation> }} props
 */
export function ChatDictationBar({ dictation }) {
  if (dictation.phase === 'recognizing') {
    return (
      <div className="chat-dictation is-busy" role="status" data-testid="chat-dictation-busy">
        <span className="chat-dictation__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        Распознаю…
      </div>
    )
  }
  const left = CHAT_DICTATION_MAX_SEC - dictation.seconds
  const bars = Array.from({ length: CHAT_DICTATION_BARS }, (_, i) => dictation.levels[i - (CHAT_DICTATION_BARS - dictation.levels.length)] ?? 0)
  return (
    <div className="chat-dictation" data-testid="chat-dictation">
      <button type="button" className="chat-dictation__cancel" aria-label="Отменить запись" title="Отменить" onClick={dictation.cancel}>
        <X size={20} aria-hidden />
      </button>
      <span className="chat-dictation__dot" aria-hidden />
      <span className={`chat-dictation__time${left <= WARN_LEFT_SEC ? ' is-ending' : ''}`} aria-live="off">
        {formatDictationTime(dictation.seconds)}
      </span>
      <span className="chat-dictation__wave" aria-hidden>
        {bars.map((level, i) => (
          <i key={i} style={{ transform: `scaleY(${Math.max(0.12, level)})` }} />
        ))}
      </span>
      <span className="sr-only">Идёт запись — говорите</span>
    </div>
  )
}
