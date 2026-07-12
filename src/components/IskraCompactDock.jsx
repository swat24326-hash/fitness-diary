import { Maximize2, Mic, Send, Sparkles, Volume2, X } from 'lucide-react'
import { ISKRA_NAME } from '../lib/admin/geminiIskraCore.js'

/**
 * Компактный док ИСКРЫ — диалог без блокировки страницы.
 */
export function IskraCompactDock({
  entered,
  listening,
  loading,
  clubName,
  advisorLabel,
  statusLine,
  proactiveHints,
  threadOpen,
  onToggleThread,
  messages,
  personaLabel,
  input,
  onInputChange,
  onSubmit,
  onMic,
  onExpand,
  onClose,
  onHintClick,
  voiceSupported,
  rateLimitSec,
  error,
  autoSpeak,
  onToggleAutoSpeak,
}) {
  const visibleMessages = threadOpen ? messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-4) : []

  return (
    <div
      className={[
        'iskra-dock',
        entered ? 'iskra-dock--open' : '',
        listening ? 'iskra-dock--listening' : '',
        loading ? 'iskra-dock--thinking' : '',
        threadOpen ? 'iskra-dock--thread' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={`${ISKRA_NAME} — компактный диалог`}
    >
      {threadOpen ? (
        <div className="iskra-dock__thread" aria-live="polite">
          {visibleMessages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`iskra-dock__bubble iskra-dock__bubble--${msg.role}`}
            >
              {msg.role === 'assistant' ? (
                <>
                  <span className="iskra-dock__bubble-name">{personaLabel}</span>
                  <p>{msg.content}</p>
                </>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          ))}
          {loading ? (
            <div className="iskra-dock__bubble iskra-dock__bubble--assistant iskra-dock__bubble--typing">
              <span className="iskra-dock__bubble-name">{personaLabel}</span>
              <div className="iskra-dock__typing" aria-hidden>
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {proactiveHints?.length && !threadOpen ? (
        <div className="iskra-dock__hints">
          {proactiveHints.slice(0, 3).map((hint) => (
            <button
              key={hint.id}
              type="button"
              className={`iskra-dock__hint iskra-dock__hint--${hint.tone || 'neutral'}`}
              disabled={loading || rateLimitSec > 0}
              onClick={() => onHintClick(hint.message, hint.id)}
            >
              {hint.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="iskra-dock__bar">
        <button
          type="button"
          className="iskra-dock__orb"
          aria-label={threadOpen ? 'Свернуть диалог' : 'Развернуть последние сообщения'}
          onClick={onToggleThread}
        >
          <span className="iskra-dock__orb-ring" aria-hidden />
          <span className="iskra-dock__orb-ring iskra-dock__orb-ring--2" aria-hidden />
          <Sparkles size={20} aria-hidden />
        </button>

        <div className="iskra-dock__meta">
          <span className="iskra-dock__title">
            {ISKRA_NAME}
            {advisorLabel ? ` · ${advisorLabel}` : ''}
          </span>
          <span className="iskra-dock__status">{statusLine}</span>
        </div>

        <form
          className="iskra-dock__form"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          {voiceSupported ? (
            <button
              type="button"
              className={`iskra-dock__icon-btn${listening ? ' iskra-dock__icon-btn--mic' : ''}`}
              aria-label={listening ? 'Остановить запись' : 'Сказать голосом'}
              aria-pressed={listening}
              onClick={onMic}
            >
              <Mic size={18} />
            </button>
          ) : null}
          <input
            className="iskra-dock__input"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={listening ? 'Говорите…' : 'Спросите ИСКРУ…'}
            disabled={loading}
            aria-label="Сообщение ИСКРЕ"
          />
          <button
            type="button"
            className={`iskra-dock__icon-btn${autoSpeak ? ' iskra-dock__icon-btn--on' : ''}`}
            aria-label="Автоозвучка"
            aria-pressed={autoSpeak}
            onClick={onToggleAutoSpeak}
          >
            <Volume2 size={16} />
          </button>
          <button type="submit" className="iskra-dock__send" disabled={loading || !input.trim() || rateLimitSec > 0}>
            <Send size={16} />
          </button>
        </form>

        <div className="iskra-dock__actions">
          <button type="button" className="iskra-dock__icon-btn" aria-label="Полная панель" onClick={onExpand}>
            <Maximize2 size={16} />
          </button>
          <button type="button" className="iskra-dock__icon-btn" aria-label="Закрыть ИСКРУ" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {error ? <p className="iskra-dock__error">{error}</p> : null}
      {clubName ? <p className="iskra-dock__club muted">{clubName}</p> : null}
    </div>
  )
}
