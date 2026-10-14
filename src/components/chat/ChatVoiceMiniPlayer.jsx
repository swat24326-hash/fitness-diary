import { useEffect } from 'react'
import { X } from 'lucide-react'
import { formatVoiceTime } from '../../lib/chat/chatVoiceCore.js'
import { closeVoice, cycleVoiceSpeed, registerVoiceInlineHost, toggleVoice } from '../../lib/chat/chatVoicePlayback.js'
import { useChatVoicePlayback } from '../../hooks/useChatVoicePlayer.js'
import { ChatVoicePlayIcon } from './ChatVoiceBubble.jsx'
import '../../styles/chat-voice.css'

/** Голосовое ещё в ленте на экране — прокрутить к нему, как нажатие на мини-плеер в Telegram. */
function showMessage(key) {
  document.querySelector(`[data-msg-id="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/**
 * Мини-плеер, как в Telegram: голосовое играет дальше, даже если пузырь ушёл из виду или вы ушли из диалога.
 * inline — полоска над лентой диалога; без него — плавающая плашка снизу на любом экране (App), пока нет inline.
 */
export function ChatVoiceMiniPlayer({ inline = false }) {
  const { track, status, progress, speed, inlineHosts } = useChatVoicePlayback()

  useEffect(() => (inline ? registerVoiceInlineHost() : undefined), [inline])

  if (!track || track.preview || (!inline && inlineHosts > 0)) return null
  return (
    <div className={`chat-voice-mini${inline ? '' : ' chat-voice-mini--floating'}`} role="region" aria-label="Голосовое" data-testid="chat-voice-mini">
      <button
        type="button"
        className="chat-voice-mini__play"
        onClick={() => void toggleVoice(track)}
        aria-label={status === 'playing' ? 'Пауза' : 'Слушать'}
        data-testid="chat-voice-mini-toggle"
      >
        <ChatVoicePlayIcon status={status} />
      </button>
      <button type="button" className="chat-voice-mini__info" onClick={() => showMessage(track.key)}>
        <span className="chat-voice-mini__title">{track.title || 'Голосовое'}</span>
        <span className="chat-voice-mini__time">
          {formatVoiceTime(progress * track.sec)} / {formatVoiceTime(track.sec)}
        </span>
      </button>
      <button type="button" className="chat-voice__chip" onClick={cycleVoiceSpeed} aria-label="Скорость">
        {speed}x
      </button>
      <button type="button" className="chat-voice-mini__close" onClick={closeVoice} aria-label="Закрыть плеер" data-testid="chat-voice-mini-close">
        <X size={18} aria-hidden />
      </button>
      <span className="chat-voice-mini__bar" style={{ transform: `scaleX(${progress})` }} aria-hidden />
    </div>
  )
}
