import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Volume2,
  Wallet,
  X,
} from 'lucide-react'
import { fetchClubSalesBundle } from '../lib/admin/adminSalesService.js'
import { postGeminiAnalytics } from '../lib/admin/geminiAnalyticsService.js'
import { resolveGeminiComparePrevious } from '../lib/admin/geminiAnalyticsPrompt.js'
import { reportDateForMonth } from '../lib/admin/geminiPanelKpi.js'
import { GeminiContextKpi } from './GeminiContextKpi.jsx'
import {
  isSpeechRecognitionSupported,
  loadGeminiAutoSpeak,
  loadGeminiGender,
  previewGeminiVoice,
  saveGeminiAutoSpeak,
  saveGeminiGender,
  speakGeminiText,
  startGeminiSpeechRecognition,
  stopGeminiSpeech,
} from '../lib/geminiAnalyticsSpeech.js'
import { periodLabelRu } from '../lib/admin/geminiAnalyticsSnapshot.js'
import '../styles/gemini-analytics.css'

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

const QUICK_PROMPTS = [
  { label: 'Че по плану?', message: 'Че там по плану продаж за этот месяц?', compare: false, icon: Target },
  { label: 'Где косяк?', message: 'Где главный косяк в цифрах за месяц?', compare: false, icon: Sparkles },
  {
    label: 'С прошлым месяцем',
    message: 'Сравни с прошлым месяцем — что лучше, что хуже?',
    compare: true,
    icon: TrendingUp,
  },
  {
    label: 'FIT-CITY vs отчёт',
    message: 'Сходятся ли ручной отчёт и FIT-CITY? Помни — в системе только тренеры с планшетом.',
    compare: false,
    icon: Dumbbell,
  },
  { label: 'ФОТ и маржа', message: 'ФОТ и чистая прибыль — норм или давит?', compare: false, icon: Wallet },
]

function shiftMonth(year, month, delta) {
  const d = new Date(Number(year), Number(month) - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   clubId: string,
 *   clubName?: string,
 *   initialYear?: number,
 *   initialMonth?: number,
 * }} props
 */
export function GeminiAnalyticsPanel({
  open,
  onClose,
  clubId,
  clubName = '',
  initialYear,
  initialMonth,
}) {
  const now = new Date()
  const [year, setYear] = useState(initialYear ?? now.getFullYear())
  const [month, setMonth] = useState(initialMonth ?? now.getMonth() + 1)
  const [gender, setGender] = useState(() => loadGeminiGender())
  const [autoSpeak, setAutoSpeak] = useState(() => loadGeminiAutoSpeak())
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [rateLimitSec, setRateLimitSec] = useState(0)
  const [lastRetry, setLastRetry] = useState(null)
  const [kpiBundle, setKpiBundle] = useState(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const [entered, setEntered] = useState(false)
  const [voiceSupported] = useState(() => isSpeechRecognitionSupported())
  const listRef = useRef(null)
  const recognitionRef = useRef(null)

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return undefined
    }
    const t = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(t)
  }, [open])

  useEffect(() => {
    if (initialYear) setYear(initialYear)
    if (initialMonth) setMonth(initialMonth)
  }, [initialYear, initialMonth, open])

  useEffect(() => {
    if (!open) {
      stopGeminiSpeech()
      stopListening()
      return undefined
    }
    setError('')
    setInput('')
    setMessages([
      {
        role: 'system',
        content: `Смотрим ${periodLabelRu(year, month)} · ${clubName || 'клуб'}`,
      },
    ])
    return () => {
      stopGeminiSpeech()
      stopListening()
    }
  }, [open, clubId, year, month, clubName, stopListening])

  useEffect(() => {
    if (!open || !clubId) {
      setKpiBundle(null)
      return undefined
    }
    let cancelled = false
    const reportDate = reportDateForMonth(year, month)
    if (!reportDate) return undefined

    setKpiLoading(true)
    void fetchClubSalesBundle({ clubId, reportDate })
      .then((bundle) => {
        if (!cancelled) setKpiBundle(bundle)
      })
      .catch(() => {
        if (!cancelled) setKpiBundle(null)
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, clubId, year, month])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  const personaLabel = gender === 'female' ? 'Василиса' : 'Василий'
  const personaShort = gender === 'female' ? 'В' : 'В'
  const panelClass = `gemini-panel gemini-panel--${gender}${entered ? ' gemini-panel--open' : ''}`

  useEffect(() => {
    if (rateLimitSec <= 0) return undefined
    const t = setInterval(() => {
      setRateLimitSec((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [rateLimitSec])

  const chatHistory = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
    [messages],
  )

  const sendMessage = useCallback(
    async (text, comparePrevious = false, opts = {}) => {
      const isRetry = opts.retry === true
      const userMessage = String(text ?? '').trim()
      if (!userMessage || !clubId || loading) return
      if (rateLimitSec > 0) return

      const compare = resolveGeminiComparePrevious({ userMessage, comparePrevious })

      stopListening()
      setError('')
      setLoading(true)
      if (isRetry) {
        setMessages((prev) => {
          if (prev.some((m) => m.role === 'user' && m.content === userMessage)) return prev
          return [...prev, { role: 'user', content: userMessage }]
        })
      } else {
        setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
      }

      try {
        const data = await postGeminiAnalytics({
          clubId,
          year,
          month,
          gender,
          userMessage,
          messages: chatHistory,
          comparePrevious: compare,
        })
        const reply = String(data?.text ?? '').trim()
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
        setLastRetry(null)
        if (autoSpeak) void speakGeminiText(reply, gender)
      } catch (e) {
        const msg = e?.message ? String(e.message) : 'Не удалось получить ответ'
        setError(msg)
        setLastRetry({ text: userMessage, comparePrevious: compare })
        const wait = Number(e?.retryAfterSec) || 0
        if (wait > 0) setRateLimitSec(wait)
        if (!isRetry) {
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === 'user' && last.content === userMessage) return prev.slice(0, -1)
            return prev
          })
        }
      } finally {
        setLoading(false)
        setInput('')
      }
    },
    [clubId, year, month, gender, chatHistory, loading, stopListening, autoSpeak, rateLimitSec],
  )

  const toggleVoiceInput = useCallback(() => {
    if (!voiceSupported || loading || !clubId) return
    if (listening) {
      stopListening()
      return
    }

    setError('')
    const session = startGeminiSpeechRecognition({
      onInterim: (text) => setInput(text),
      onFinal: (text) => {
        setInput(text)
        void sendMessage(text, false)
      },
      onError: (msg) => {
        setError(msg)
        setListening(false)
        recognitionRef.current = null
      },
      onEnd: () => {
        setListening(false)
        recognitionRef.current = null
      },
    })

    if (!session) {
      setError('Голосовой ввод не поддерживается в этом браузере')
      return
    }

    recognitionRef.current = session
    setListening(true)
    setInput('')
  }, [voiceSupported, loading, clubId, listening, stopListening, sendMessage])

  if (!open) return null

  return (
    <div className={`gemini-panel-backdrop${entered ? ' gemini-panel-backdrop--open' : ''}`} role="presentation" onClick={onClose}>
      <aside
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-label={`Аналитик ${personaLabel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gemini-panel__glow" aria-hidden />

        <header className="gemini-panel__head">
          <div className="gemini-panel__head-main">
            <div className={`gemini-panel__avatar gemini-panel__avatar--${gender}`} aria-hidden>
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="gemini-panel__title">{personaLabel}</h2>
              <p className="gemini-panel__sub muted">{clubName || 'Выберите клуб в шапке'}</p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm gemini-panel__close" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <GeminiContextKpi bundle={kpiBundle} year={year} month={month} loading={kpiLoading} />

        <div className="gemini-panel__controls">
          <div className="gemini-panel__month">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label="Предыдущий месяц"
              onClick={() => {
                const next = shiftMonth(year, month, -1)
                setYear(next.year)
                setMonth(next.month)
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="gemini-panel__month-label">
              {MONTH_NAMES[(month || 1) - 1]} {year}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label="Следующий месяц"
              onClick={() => {
                const next = shiftMonth(year, month, 1)
                setYear(next.year)
                setMonth(next.month)
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="gemini-panel__gender" role="group" aria-label="Голос аналитика">
            <button
              type="button"
              className={`gemini-panel__gender-btn${gender === 'male' ? ' gemini-panel__gender-btn--active' : ''}`}
              onClick={() => {
                setGender('male')
                saveGeminiGender('male')
                previewGeminiVoice('male')
              }}
            >
              ♂ Василий
            </button>
            <button
              type="button"
              className={`gemini-panel__gender-btn${gender === 'female' ? ' gemini-panel__gender-btn--active' : ''}`}
              onClick={() => {
                setGender('female')
                saveGeminiGender('female')
                previewGeminiVoice('female')
              }}
            >
              ♀ Василиса
            </button>
            <button
              type="button"
              className={`gemini-panel__speak-toggle${autoSpeak ? ' gemini-panel__speak-toggle--on' : ''}`}
              aria-pressed={autoSpeak}
              aria-label={autoSpeak ? 'Автоозвучка включена' : 'Автоозвучка выключена'}
              title={autoSpeak ? 'Ответы озвучиваются' : 'Только текст, без автоозвучки'}
              onClick={() => {
                setAutoSpeak((on) => {
                  const next = !on
                  saveGeminiAutoSpeak(next)
                  if (next) previewGeminiVoice(gender)
                  else stopGeminiSpeech()
                  return next
                })
              }}
            >
              <Volume2 size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="gemini-panel__chips">
          {QUICK_PROMPTS.map((chip) => {
            const ChipIcon = chip.icon
            return (
              <button
                key={chip.label}
                type="button"
                className="gemini-panel__chip"
                disabled={loading || !clubId || rateLimitSec > 0}
                onClick={() => void sendMessage(chip.message, chip.compare)}
              >
                <ChipIcon size={13} aria-hidden />
                {chip.label}
              </button>
            )
          })}
        </div>

        <div className="gemini-panel__messages" ref={listRef}>
          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`gemini-panel__msg gemini-panel__msg--${msg.role}`}
            >
              {msg.role === 'assistant' ? (
                <>
                  <div className={`gemini-panel__msg-avatar gemini-panel__msg-avatar--${gender}`} aria-hidden>
                    {personaShort}
                  </div>
                  <div className="gemini-panel__msg-body">
                    <span className="gemini-panel__msg-name">{personaLabel}</span>
                    <p>{msg.content}</p>
                    <div className="gemini-panel__msg-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label="Озвучить"
                        onClick={() => void speakGeminiText(msg.content, gender)}
                      >
                        <Volume2 size={14} />
                      </button>
                    </div>
                  </div>
                </>
              ) : msg.role === 'user' ? (
                <>
                  <div className="gemini-panel__msg-body gemini-panel__msg-body--user">
                    <p>{msg.content}</p>
                  </div>
                  <div className="gemini-panel__msg-avatar gemini-panel__msg-avatar--user" aria-hidden>
                    Я
                  </div>
                </>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          ))}
          {loading ? (
            <div className="gemini-panel__msg gemini-panel__msg--assistant gemini-panel__msg--typing" aria-busy="true">
              <div className={`gemini-panel__msg-avatar gemini-panel__msg-avatar--${gender}`} aria-hidden>
                {personaShort}
              </div>
              <div className="gemini-panel__msg-body">
                <span className="gemini-panel__msg-name">{personaLabel} думает…</span>
                <div className="gemini-panel__typing" aria-label="Загрузка">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="gemini-panel__error-wrap" role="alert">
            <p className="gemini-panel__error">{error}</p>
            {rateLimitSec > 0 ? (
              <p className="gemini-panel__error-hint muted">Можно спросить через {rateLimitSec} сек</p>
            ) : null}
            {lastRetry ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm gemini-panel__retry"
                disabled={loading || rateLimitSec > 0}
                onClick={() => void sendMessage(lastRetry.text, lastRetry.comparePrevious, { retry: true })}
              >
                <RotateCcw size={14} aria-hidden />
                Повторить вопрос
              </button>
            ) : null}
          </div>
        ) : null}

        <form
          className="gemini-panel__form"
          onSubmit={(e) => {
            e.preventDefault()
            void sendMessage(input, false)
          }}
        >
          {rateLimitSec > 0 ? (
            <div className="gemini-panel__rate-bar" aria-hidden>
              <span style={{ width: `${Math.max(8, (rateLimitSec / 12) * 100)}%` }} />
            </div>
          ) : null}
          {voiceSupported ? (
            <button
              type="button"
              className={`btn btn-secondary gemini-panel__mic${listening ? ' gemini-panel__mic--active' : ''}`}
              disabled={loading || !clubId}
              aria-label={listening ? 'Остановить запись' : 'Сказать голосом'}
              aria-pressed={listening}
              onClick={toggleVoiceInput}
            >
              <Mic size={18} aria-hidden />
            </button>
          ) : null}
          <input
            className="gemini-panel__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? 'Говорите…' : 'Спроси про цифры…'}
            disabled={loading || !clubId}
            aria-label="Сообщение"
          />
          <button type="submit" className="btn btn-primary gemini-panel__send" disabled={loading || !clubId || !input.trim() || rateLimitSec > 0}>
            <Send size={16} aria-hidden />
            <span className="sr-only">Отправить</span>
          </button>
        </form>
        {voiceSupported ? (
          <p className="gemini-panel__voice-hint muted">
            {listening ? 'Слушаю… нажмите микрофон, чтобы остановить' : 'Микрофон — спросить голосом · 🔊 — автоозвучка · ♂/♀ — проверить голос'}
          </p>
        ) : (
          <p className="gemini-panel__voice-hint muted">Голосовой ввод: Chrome или Edge на Android. Ответ можно озвучить 🔊</p>
        )}
      </aside>
    </div>
  )
}
