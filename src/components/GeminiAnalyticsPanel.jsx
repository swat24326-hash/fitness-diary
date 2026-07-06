import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Mic,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  CircleHelp,
  Volume2,
  Wallet,
  X,
} from 'lucide-react'
import { postGeminiAnalytics, prefetchGeminiSnapshot } from '../lib/admin/geminiAnalyticsService.js'
import { isGeminiReplyIncomplete, resolveGeminiComparePrevious } from '../lib/admin/geminiAnalyticsPrompt.js'
import { GEMINI_QUICK_CHIPS } from '../lib/admin/geminiInstantReplies.js'
import { buildGeminiMicroIntro } from '../lib/admin/geminiAssistantIntro.js'
import { ISKRA_FULL_NAME, ISKRA_NAME } from '../lib/admin/geminiIskraCore.js'
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

const CHIP_ICONS = {
  intro: CircleHelp,
  plan: Target,
  gap: Sparkles,
  compare: TrendingUp,
  fitcity: Dumbbell,
  finance: Wallet,
  trainer_inactive: Dumbbell,
  payroll_gap: Wallet,
  sales_coverage: Target,
  sales_structure: TrendingUp,
  sales_refunds: Wallet,
  sales_directions: Target,
}

function comparePreviousFromChip(userText) {
  return GEMINI_QUICK_CHIPS.some((chip) => chip.message === userText && chip.compare)
}

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
 *   selectedTrainerId?: string | null,
 *   selectedTrainerName?: string,
 *   initialMessage?: string | null,
 * }} props
 */
export function GeminiAnalyticsPanel({
  open,
  onClose,
  clubId,
  clubName = '',
  initialYear,
  initialMonth,
  selectedTrainerId = null,
  selectedTrainerName = '',
  initialMessage = null,
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
  const [kpi, setKpi] = useState(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const [trainers, setTrainers] = useState([])
  const [focusTrainerId, setFocusTrainerId] = useState(null)
  const [entered, setEntered] = useState(false)
  const [voiceSupported] = useState(() => isSpeechRecognitionSupported())
  const listRef = useRef(null)
  const recognitionRef = useRef(null)
  const initialMessageSentRef = useRef(false)

  const settingsHref = clubId ? `/admin/iskra-settings?club=${encodeURIComponent(clubId)}` : '/admin/iskra-settings'
  const activeTrainerId = focusTrainerId || null
  const focusTrainerLabel =
    trainers.find((t) => t.trainer_id === activeTrainerId)?.trainer_name ||
    (activeTrainerId && selectedTrainerName) ||
    ''

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
    if (open) {
      setFocusTrainerId(selectedTrainerId || null)
      initialMessageSentRef.current = false
    }
  }, [open, selectedTrainerId])

  useEffect(() => {
    if (!open) {
      stopGeminiSpeech()
      stopListening()
      return undefined
    }
    setError('')
    setInput('')
    const focusLine = focusTrainerLabel
      ? ` Фокус: тренер ${focusTrainerLabel}.`
      : selectedTrainerId && selectedTrainerName
        ? ` Фокус: тренер ${selectedTrainerName}.`
        : ''
    setMessages([
      {
        role: 'assistant',
        content: `${buildGeminiMicroIntro({
          clubName,
          periodLabel: periodLabelRu(year, month),
          gender,
          hasClub: !!clubId,
        })}${focusLine}`,
      },
    ])
    return () => {
      stopGeminiSpeech()
      stopListening()
    }
  }, [open, clubId, year, month, clubName, gender, stopListening, focusTrainerLabel, selectedTrainerId, selectedTrainerName])

  useEffect(() => {
    if (!open || !clubId) {
      setKpi(null)
      setTrainers([])
      return undefined
    }
    let cancelled = false

    setKpiLoading(true)
    void prefetchGeminiSnapshot({ clubId, year, month })
      .then((data) => {
        if (cancelled) return
        setKpi(data?.kpi ?? null)
        setTrainers(Array.isArray(data?.trainers) ? data.trainers : [])
      })
      .catch(() => {
        if (!cancelled) setKpi(null)
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

  const personaLabel = ISKRA_NAME
  const personaShort = 'И'
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
      const completionRetry = opts.completionRetry === true
      const userMessage = String(text ?? '').trim()
      if (!userMessage || !clubId || loading) return
      if (rateLimitSec > 0 && !completionRetry) return

      const compare = resolveGeminiComparePrevious({ userMessage, comparePrevious })

      stopListening()
      setError('')
      setLoading(true)
      if (isRetry && !completionRetry) {
        setMessages((prev) => {
          if (prev.some((m) => m.role === 'user' && m.content === userMessage)) return prev
          return [...prev, { role: 'user', content: userMessage }]
        })
      } else if (!completionRetry) {
        setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
      }

      const fetchReply = (flags = {}) =>
        postGeminiAnalytics({
          clubId,
          year,
          month,
          gender,
          userMessage,
          messages: chatHistory,
          comparePrevious: compare,
          skipCache: flags.skipCache,
          forceGemini: flags.forceGemini,
          completionRetry: flags.completionRetry,
          selectedTrainerId: activeTrainerId || undefined,
        })

      try {
        let data = await fetchReply({
          skipCache: completionRetry,
          forceGemini: completionRetry,
          completionRetry,
        })
        let reply = String(data?.text ?? '').trim()
        let incomplete = data?.incomplete === true || isGeminiReplyIncomplete(reply)

        if (incomplete && !completionRetry) {
          try {
            data = await fetchReply({ skipCache: true, forceGemini: true, completionRetry: true })
            reply = String(data?.text ?? '').trim()
            incomplete = isGeminiReplyIncomplete(reply)
          } catch {
            /* оставляем первый ответ или ошибку ниже */
          }
        }

        if (completionRetry) {
          setMessages((prev) => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].incomplete) {
                next[i] = { role: 'assistant', content: reply, incomplete }
                return next
              }
            }
            return [...next, { role: 'assistant', content: reply, incomplete }]
          })
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: reply, incomplete }])
        }

        setLastRetry(incomplete ? { text: userMessage, comparePrevious: compare, completionRetry: true } : null)
        setError('')
        if (autoSpeak && reply && !incomplete) void speakGeminiText(reply, gender)
      } catch (e) {
        const msg = e?.message ? String(e.message) : 'Не удалось получить ответ'
        setError(msg)
        setLastRetry({
          text: userMessage,
          comparePrevious: compare,
          completionRetry: e?.incomplete === true || completionRetry,
        })
        const wait = Number(e?.retryAfterSec) || 0
        if (wait > 0) setRateLimitSec(wait)
        if (!isRetry && !completionRetry) {
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
    [clubId, year, month, gender, chatHistory, loading, stopListening, autoSpeak, rateLimitSec, activeTrainerId],
  )

  useEffect(() => {
    if (!open || !clubId || !initialMessage?.trim() || initialMessageSentRef.current) return
    initialMessageSentRef.current = true
    const t = window.setTimeout(() => {
      void sendMessage(initialMessage, false)
    }, 450)
  }, [open, clubId, initialMessage])

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
        aria-label={`${ISKRA_FULL_NAME}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gemini-panel__glow" aria-hidden />

        <header className="gemini-panel__head">
          <div className="gemini-panel__head-main">
            <div className={`gemini-panel__avatar gemini-panel__avatar--${gender}`} aria-hidden>
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="gemini-panel__title">{ISKRA_FULL_NAME}</h2>
              <p className="gemini-panel__sub muted">{clubName || 'Выберите клуб в шапке'}</p>
            </div>
          </div>
          <div className="gemini-panel__head-actions">
            <Link
              to={settingsHref}
              className="btn btn-ghost btn-sm gemini-panel__settings"
              aria-label="Настройки ИСКРА"
              title="Настройки ИСКРА"
              onClick={onClose}
            >
              <Settings size={18} />
            </Link>
            <button type="button" className="btn btn-ghost btn-sm gemini-panel__close" onClick={onClose} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>
        </header>

        {trainers.length > 0 ? (
          <div className="gemini-panel__focus">
            <label className="gemini-panel__focus-label" htmlFor="iskra-trainer-focus">
              Фокус анализа
            </label>
            <select
              id="iskra-trainer-focus"
              className="select gemini-panel__focus-select"
              value={activeTrainerId ?? ''}
              onChange={(e) => setFocusTrainerId(e.target.value || null)}
              disabled={loading}
            >
              <option value="">Весь клуб (продажи + сводка тренеров)</option>
              {trainers.map((t) => (
                <option key={t.trainer_id} value={t.trainer_id}>
                  Тренер: {t.trainer_name || t.trainer_id}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <GeminiContextKpi kpi={kpi} year={year} month={month} loading={kpiLoading} />

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

          <div className="gemini-panel__gender" role="group" aria-label="Голос озвучки">
            <button
              type="button"
              className={`gemini-panel__gender-btn${gender === 'female' ? ' gemini-panel__gender-btn--active' : ''}`}
              onClick={() => {
                setGender('female')
                saveGeminiGender('female')
                previewGeminiVoice('female')
              }}
            >
              ♀ Голос
            </button>
            <button
              type="button"
              className={`gemini-panel__gender-btn${gender === 'male' ? ' gemini-panel__gender-btn--active' : ''}`}
              onClick={() => {
                setGender('male')
                saveGeminiGender('male')
                previewGeminiVoice('male')
              }}
            >
              ♂ Голос
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
          {GEMINI_QUICK_CHIPS.map((chip) => {
            const ChipIcon = CHIP_ICONS[chip.id] ?? Sparkles
            return (
              <button
                key={chip.id}
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
                      {msg.incomplete ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={loading || rateLimitSec > 0}
                          onClick={() => {
                            let userText = ''
                            for (let j = i - 1; j >= 0; j--) {
                              if (messages[j].role === 'user') {
                                userText = messages[j].content
                                break
                              }
                            }
                            if (userText) {
                              void sendMessage(userText, comparePreviousFromChip(userText), {
                                completionRetry: true,
                              })
                            }
                          }}
                        >
                          <RotateCcw size={14} aria-hidden />
                          Дописать
                        </button>
                      ) : null}
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
                <span className="gemini-panel__msg-name">{personaLabel} анализирует…</span>
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
                onClick={() =>
                  void sendMessage(lastRetry.text, lastRetry.comparePrevious, {
                    retry: true,
                    completionRetry: lastRetry.completionRetry === true,
                  })
                }
              >
                <RotateCcw size={14} aria-hidden />
                {lastRetry.completionRetry ? 'Дописать ответ' : 'Повторить вопрос'}
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
            placeholder={listening ? 'Говорите…' : 'Спросите ИСКРУ про цифры…'}
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
            {listening ? 'Слушаю… нажмите микрофон, чтобы остановить' : 'Микрофон — голосовой ввод · 🔊 — автоозвучка · ♀/♂ — голос TTS (по умолчанию женский)'}
          </p>
        ) : (
          <p className="gemini-panel__voice-hint muted">Голосовой ввод: Chrome или Edge на Android. Ответ можно озвучить 🔊</p>
        )}
      </aside>
    </div>
  )
}
