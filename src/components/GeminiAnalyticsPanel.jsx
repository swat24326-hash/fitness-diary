import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Mic, Volume2, X } from 'lucide-react'
import { postGeminiAnalytics } from '../lib/admin/geminiAnalyticsService.js'
import {
  isSpeechRecognitionSupported,
  loadGeminiGender,
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
  { label: 'Че по плану?', message: 'Че там по плану продаж за этот месяц?', compare: false },
  { label: 'Где косяк?', message: 'Где главный косяк в цифрах за месяц?', compare: false },
  {
    label: 'С прошлым месяцем',
    message: 'Сравни с прошлым месяцем — что лучше, что хуже?',
    compare: true,
  },
  {
    label: 'FIT-CITY vs отчёт',
    message: 'Сходятся ли ручной отчёт и FIT-CITY по тренировкам?',
    compare: false,
  },
  { label: 'ФОТ и маржа', message: 'ФОТ и чистая прибыль — норм или давит?', compare: false },
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
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceSupported] = useState(() => isSpeechRecognitionSupported())
  const listRef = useRef(null)
  const recognitionRef = useRef(null)

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

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
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  const personaLabel = gender === 'female' ? 'Василиса' : 'Василий'

  const chatHistory = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant'),
    [messages],
  )

  const sendMessage = useCallback(
    async (text, comparePrevious = false) => {
      const userMessage = String(text ?? '').trim()
      if (!userMessage || !clubId || loading) return

      stopListening()
      setError('')
      setLoading(true)
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }])

      try {
        const data = await postGeminiAnalytics({
          clubId,
          year,
          month,
          gender,
          userMessage,
          messages: chatHistory,
          comparePrevious,
        })
        const reply = String(data?.text ?? '').trim()
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
        speakGeminiText(reply, gender)
      } catch (e) {
        const msg = e?.message ? String(e.message) : 'Не удалось получить ответ'
        setError(msg)
      } finally {
        setLoading(false)
        setInput('')
      }
    },
    [clubId, year, month, gender, chatHistory, loading, stopListening],
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
    <div className="gemini-panel-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="gemini-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Аналитик ${personaLabel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="gemini-panel__head">
          <div>
            <h2 className="gemini-panel__title">✨ {personaLabel}</h2>
            <p className="gemini-panel__sub muted">{clubName || 'Выберите клуб в шапке'}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm gemini-panel__close" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

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
              }}
            >
              ♀ Василиса
            </button>
          </div>
        </div>

        <div className="gemini-panel__chips">
          {QUICK_PROMPTS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="gemini-panel__chip"
              disabled={loading || !clubId}
              onClick={() => void sendMessage(chip.message, chip.compare)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="gemini-panel__messages" ref={listRef}>
          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`gemini-panel__msg gemini-panel__msg--${msg.role}`}
            >
              {msg.role === 'assistant' ? (
                <div className="gemini-panel__msg-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Озвучить"
                    onClick={() => speakGeminiText(msg.content, gender)}
                  >
                    <Volume2 size={14} />
                  </button>
                </div>
              ) : null}
              <p>{msg.content}</p>
            </div>
          ))}
          {loading ? (
            <div className="gemini-panel__skeleton" aria-busy="true" aria-label="Загрузка">
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="gemini-panel__error" role="alert">
            {error}
          </p>
        ) : null}

        <form
          className="gemini-panel__form"
          onSubmit={(e) => {
            e.preventDefault()
            void sendMessage(input, false)
          }}
        >
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
          <button type="submit" className="btn btn-primary" disabled={loading || !clubId || !input.trim()}>
            →
          </button>
        </form>
        {voiceSupported ? (
          <p className="gemini-panel__voice-hint muted">
            {listening ? 'Слушаю… нажмите микрофон, чтобы остановить' : 'Микрофон — спросить голосом, ответ озвучится'}
          </p>
        ) : (
          <p className="gemini-panel__voice-hint muted">Голосовой ввод: Chrome или Edge на Android. Ответ можно озвучить 🔊</p>
        )}
      </aside>
    </div>
  )
}
