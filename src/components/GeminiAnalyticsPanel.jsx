import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Dumbbell,
  Lightbulb,
  Mic,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
  Volume2,
  Wallet,
} from 'lucide-react'
import { CloseButton } from './CloseButton'
import { IskraCompactDock } from './IskraCompactDock.jsx'
import { postGeminiAnalytics, prefetchGeminiSnapshot } from '../lib/admin/geminiAnalyticsService.js'
import { isGeminiReplyIncomplete, resolveGeminiComparePrevious } from '../lib/admin/geminiAnalyticsPrompt.js'
import {
  comparePreviousFromQuickChips,
  defaultIskraQuickChips,
  resolveIskraQuickChips,
  resolvePanelQuickChips,
} from '../lib/admin/iskraQuickChipsCore.js'
import { buildGeminiMicroIntro } from '../lib/admin/geminiAssistantIntro.js'
import { ISKRA_FULL_NAME, ISKRA_NAME } from '../lib/admin/geminiIskraCore.js'
import { mapAppRoleToAdvisorRole } from '../lib/admin/iskraAdvisorScope.js'
import { resolveIskraAdvisorRole } from '../lib/admin/iskraAdvisorRoles.js'
import { useAuth } from '../context/AuthContext.jsx'
import { GeminiContextKpi } from './GeminiContextKpi.jsx'
import {
  isSpeechRecognitionSupported,
  loadGeminiAutoSpeak,
  primeGeminiSpeechPlayback,
  saveGeminiAutoSpeak,
  speakGeminiText,
  startGeminiSpeechRecognition,
  stopGeminiSpeech,
} from '../lib/geminiAnalyticsSpeech.js'
import { periodLabelRu } from '../lib/admin/geminiAnalyticsSnapshot.js'
import { buildIskraProactiveHints, pickRotatingHint } from '../lib/admin/iskraProactiveHints.js'
import {
  buildIskraLearningContext,
  rankHintsWithLearning,
} from '../lib/admin/iskraLearningPipeline.js'
import {
  loadIskraLearningBundleForUi,
  recordIskraLearningFeedback,
} from '../lib/admin/iskraLearningService.js'
import { deriveReplySignalKey } from '../lib/admin/iskraLearningCore.js'
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

const ISKRA_TTS_GENDER = 'female'

const CHIP_ICONS = {
  intro: CircleHelp,
  advice: Lightbulb,
  advice_plan: Target,
  plan: Target,
  gap: Sparkles,
  compare: TrendingUp,
  sales_structure: TrendingUp,
  finance: Wallet,
  month_forecast: TrendingUp,
  trainer_trainings: Dumbbell,
  trainer_salary: Wallet,
  trainer_clients: Users,
  trainer_inactive: Sparkles,
  trainer_no_type: Target,
  trainer_rank: TrendingUp,
}

function chipIconFor(chip) {
  const handler = String(chip?.handler_id ?? chip?.id ?? '').trim()
  return CHIP_ICONS[handler] ?? Sparkles
}

function shiftMonth(year, month, delta) {
  const d = new Date(Number(year), Number(month) - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * @param {{
 *   open?: boolean,
 *   mode?: 'closed'|'compact'|'expanded',
 *   onClose: () => void,
 *   onExpand?: () => void,
 *   onMinimize?: () => void,
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
  open: openLegacy,
  mode: modeProp = 'expanded',
  onClose,
  onExpand,
  onMinimize,
  clubId,
  clubName = '',
  initialYear,
  initialMonth,
  selectedTrainerId = null,
  selectedTrainerName = '',
  initialMessage = null,
}) {
  const mode =
    modeProp !== 'closed'
      ? modeProp
      : openLegacy
        ? 'expanded'
        : 'closed'
  const isActive = mode === 'compact' || mode === 'expanded'

  const { role: appRole } = useAuth()
  const advisorRole = useMemo(
    () => resolveIskraAdvisorRole(mapAppRoleToAdvisorRole(appRole)),
    [appRole],
  )
  const now = new Date()
  const [year, setYear] = useState(initialYear ?? now.getFullYear())
  const [month, setMonth] = useState(initialMonth ?? now.getMonth() + 1)
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
  const [kpiLoadError, setKpiLoadError] = useState('')
  const [quickChips, setQuickChips] = useState(() => defaultIskraQuickChips())
  const [trainers, setTrainers] = useState([])
  const [focusTrainerId, setFocusTrainerId] = useState(null)
  const [entered, setEntered] = useState(false)
  const [dockThreadOpen, setDockThreadOpen] = useState(false)
  const [hintTick, setHintTick] = useState(0)
  const [learningTick, setLearningTick] = useState(0)
  const [feedbackByMsg, setFeedbackByMsg] = useState(() => ({}))
  const voiceSupported = useState(() => isSpeechRecognitionSupported())[0]
  const listRef = useRef(null)
  const recognitionRef = useRef(null)
  const initialMessageSentRef = useRef(false)
  const prevModeRef = useRef(/** @type {'closed'|'compact'|'expanded'} */ ('closed'))

  const settingsHref = clubId ? `/admin/iskra-settings?club=${encodeURIComponent(clubId)}` : '/admin/iskra-settings'
  const activeTrainerId = focusTrainerId || null
  const focusTrainerLabel =
    trainers.find((t) => t.trainer_id === activeTrainerId)?.trainer_name ||
    (activeTrainerId && selectedTrainerName) ||
    ''

  const panelQuickChips = useMemo(
    () => resolvePanelQuickChips({ stored: quickChips, trainerId: activeTrainerId, appRole }),
    [quickChips, activeTrainerId, appRole],
  )

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const handleClose = useCallback(() => {
    stopGeminiSpeech()
    stopListening()
    setDockThreadOpen(false)
    onClose()
  }, [onClose, stopListening])

  const handleMinimize = useCallback(() => {
    stopListening()
    setDockThreadOpen(false)
    onMinimize?.()
  }, [onMinimize, stopListening])

  useEffect(() => {
    return () => {
      stopGeminiSpeech()
      stopListening()
    }
  }, [stopListening])

  useEffect(() => {
    if (mode === 'closed') {
      setEntered(false)
      return undefined
    }
    const t = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(t)
  }, [mode])

  useEffect(() => {
    if (mode !== 'compact') return undefined
    const t = window.setInterval(() => setHintTick((n) => n + 1), 8000)
    return () => window.clearInterval(t)
  }, [mode])

  useEffect(() => {
    if (initialYear) setYear(initialYear)
    if (initialMonth) setMonth(initialMonth)
  }, [initialYear, initialMonth, mode])

  useEffect(() => {
    if (!isActive) return
    setFocusTrainerId(selectedTrainerId || null)
  }, [isActive, selectedTrainerId])

  useEffect(() => {
    if (mode === 'closed') {
      prevModeRef.current = 'closed'
      stopGeminiSpeech()
      stopListening()
      return undefined
    }

    const justOpened = prevModeRef.current === 'closed'
    prevModeRef.current = mode

    if (justOpened) {
      initialMessageSentRef.current = false
      setError('')
      setInput('')
      const focusLine = focusTrainerLabel
        ? ` Сейчас запрос по тренеру ${focusTrainerLabel} — продажи клуба по-прежнему в отчёте менеджера.`
        : selectedTrainerId && selectedTrainerName
          ? ` Сейчас запрос по тренеру ${selectedTrainerName}.`
          : ''
      setMessages([
        {
          role: 'assistant',
          content: `${buildGeminiMicroIntro({
            clubName,
            periodLabel: periodLabelRu(year, month),
            gender: ISKRA_TTS_GENDER,
            hasClub: !!clubId,
          })}${focusLine}`,
        },
      ])
    }
    return () => {
      if (mode === 'closed') stopListening()
    }
  }, [
    mode,
    clubId,
    year,
    month,
    clubName,
    stopListening,
    focusTrainerLabel,
    selectedTrainerId,
    selectedTrainerName,
    isActive,
  ])

  const reloadKpi = useCallback(async () => {
    if (!clubId) {
      setKpi(null)
      setTrainers([])
      setQuickChips(defaultIskraQuickChips())
      setKpiLoadError('')
      return
    }
    setKpiLoading(true)
    setKpiLoadError('')
    const data = await prefetchGeminiSnapshot({ clubId, year, month })
    if (data.ok) {
      setKpi(data.kpi ?? null)
      setTrainers(Array.isArray(data.trainers) ? data.trainers : [])
      setQuickChips(resolveIskraQuickChips(data.quickChips))
      setKpiLoadError('')
    } else {
      setKpi(null)
      setTrainers([])
      setQuickChips(defaultIskraQuickChips())
      setKpiLoadError(data.error || 'Не удалось загрузить данные')
    }
    setKpiLoading(false)
  }, [clubId, year, month])

  useEffect(() => {
    if (mode === 'closed' || !clubId) {
      setKpi(null)
      setTrainers([])
      setQuickChips(defaultIskraQuickChips())
      setKpiLoadError('')
      return undefined
    }
    let cancelled = false
    void (async () => {
      setKpiLoading(true)
      setKpiLoadError('')
      const data = await prefetchGeminiSnapshot({ clubId, year, month })
      if (cancelled) return
      if (data.ok) {
        setKpi(data.kpi ?? null)
        setTrainers(Array.isArray(data.trainers) ? data.trainers : [])
        setQuickChips(resolveIskraQuickChips(data.quickChips))
        setKpiLoadError('')
      } else {
        setKpi(null)
        setTrainers([])
        setQuickChips(defaultIskraQuickChips())
        setKpiLoadError(data.error || 'Не удалось загрузить данные')
      }
      setKpiLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [mode, clubId, year, month])

  useEffect(() => {
    if (mode === 'closed' || !clubId) return undefined
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (document.visibilityState !== 'visible') return
      const sleptMs = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      if (sleptMs >= 30_000) void reloadKpi()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [mode, clubId, reloadKpi])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  const personaLabel = ISKRA_NAME
  const personaShort = 'И'
  const learningBundle = useMemo(() => {
    if (!clubId) return { signals: [], playbooks: [], phase: 'collect' }
    return loadIskraLearningBundleForUi(clubId)
  }, [clubId, learningTick])
  const learningCtx = useMemo(() => buildIskraLearningContext({ learningBundle }), [learningBundle])
  const proactiveHints = useMemo(() => {
    const base = buildIskraProactiveHints(kpi, { clubName })
    return rankHintsWithLearning(base, learningCtx)
  }, [kpi, clubName, learningCtx])
  const rotatingHint = useMemo(
    () => pickRotatingHint(proactiveHints, hintTick),
    [proactiveHints, hintTick],
  )
  const lastAssistantLine = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return String(messages[i].content ?? '')
    }
    return ''
  }, [messages])
  const dockStatusLine = listening
    ? 'Слушаю…'
    : loading
      ? 'Думаю…'
      : lastAssistantLine
        ? `${lastAssistantLine.slice(0, 80)}${lastAssistantLine.length > 80 ? '…' : ''}`
        : rotatingHint?.label || 'На связи — спросите или нажмите микрофон'

  const panelClass = `gemini-panel gemini-panel--female${entered ? ' gemini-panel--open' : ''}`

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

  const recordLearning = useCallback(
    (payload) => {
      if (!clubId) return
      recordIskraLearningFeedback({
        clubId,
        advisorRoleId: advisorRole.id,
        ...payload,
      })
      setLearningTick((n) => n + 1)
    },
    [clubId, advisorRole.id],
  )

  const sendMessage = useCallback(
    async (text, comparePrevious = false, opts = {}) => {
      const isRetry = opts.retry === true
      const completionRetry = opts.completionRetry === true
      const handlerId = opts.handlerId ? String(opts.handlerId).trim() : undefined
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
          gender: ISKRA_TTS_GENDER,
          userMessage,
          messages: chatHistory,
          comparePrevious: compare,
          skipCache: flags.skipCache,
          forceGemini: flags.forceGemini,
          completionRetry: flags.completionRetry,
          selectedTrainerId: activeTrainerId || undefined,
          handlerId,
          appRole,
        })

      if (handlerId && !completionRetry) {
        recordLearning({
          eventType: 'chip_click',
          handlerId,
          userMessage,
        })
      }

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

        const replyMeta = {
          source: data?.source,
          chip_id: data?.chip_id,
          intro_kind: data?.intro_kind,
          handler_id: handlerId,
          signal_key: deriveReplySignalKey(userMessage, {
            chip_id: data?.chip_id,
            handler_id: handlerId,
            intro_kind: data?.intro_kind,
          }),
        }

        if (completionRetry) {
          setMessages((prev) => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].incomplete) {
                next[i] = { role: 'assistant', content: reply, incomplete, meta: replyMeta }
                return next
              }
            }
            return [...next, { role: 'assistant', content: reply, incomplete, meta: replyMeta }]
          })
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', content: reply, incomplete, meta: replyMeta }])
        }

        setLastRetry(incomplete ? { text: userMessage, comparePrevious: compare, completionRetry: true } : null)
        setError('')
        if (autoSpeak && reply && !incomplete) {
          window.setTimeout(() => {
            void speakGeminiText(reply, ISKRA_TTS_GENDER)
          }, 80)
        }
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
    [clubId, year, month, chatHistory, loading, stopListening, autoSpeak, rateLimitSec, activeTrainerId, appRole, recordLearning],
  )

  const submitReplyFeedback = useCallback(
    (msgIndex, vote) => {
      const msg = messages[msgIndex]
      if (!msg || msg.role !== 'assistant' || msg.incomplete) return
      const key = `a-${msgIndex}`
      if (feedbackByMsg[key]) return

      let userText = ''
      for (let j = msgIndex - 1; j >= 0; j--) {
        if (messages[j].role === 'user') {
          userText = messages[j].content
          break
        }
      }

      recordLearning({
        eventType: vote === 'up' ? 'feedback_up' : 'feedback_down',
        signalKey: msg.meta?.signal_key,
        userMessage: userText,
        chipId: msg.meta?.chip_id,
        handlerId: msg.meta?.handler_id,
        introKind: msg.meta?.intro_kind,
        meta: { source: msg.meta?.source, vote },
      })
      setFeedbackByMsg((prev) => ({ ...prev, [key]: vote }))
    },
    [messages, feedbackByMsg, recordLearning],
  )

  const comparePreviousFromChip = useCallback(
    (userText) => comparePreviousFromQuickChips(panelQuickChips, userText),
    [panelQuickChips],
  )

  useEffect(() => {
    if (!isActive || !clubId || !initialMessage?.trim() || initialMessageSentRef.current) return
    initialMessageSentRef.current = true
    const timerId = window.setTimeout(() => {
      void sendMessage(initialMessage, false)
    }, 450)
    return () => window.clearTimeout(timerId)
  }, [isActive, clubId, initialMessage])

  const toggleVoiceInput = useCallback(async () => {
    if (!voiceSupported || loading || !clubId) return
    if (listening) {
      stopListening()
      return
    }

    setError('')
    primeGeminiSpeechPlayback()

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const track of stream.getTracks()) track.stop()
      }
    } catch {
      setError('Разрешите микрофон в браузере (значок замка в адресной строке)')
      return
    }

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

  if (mode === 'closed') return null

  if (mode === 'compact') {
    return (
      <IskraCompactDock
        entered={entered}
        listening={listening}
        loading={loading}
        clubName={clubName}
        advisorLabel={advisorRole.labelRu}
        statusLine={dockStatusLine}
        proactiveHints={proactiveHints}
        threadOpen={dockThreadOpen}
        onToggleThread={() => setDockThreadOpen((v) => !v)}
        messages={messages}
        personaLabel={personaLabel}
        input={input}
        onInputChange={setInput}
        onSubmit={() => void sendMessage(input, false)}
        onMic={toggleVoiceInput}
        onExpand={() => onExpand?.()}
        onClose={handleClose}
        onHintClick={(msg, hintId) => {
          if (hintId) {
            recordLearning({ eventType: 'hint_click', hintId, userMessage: msg })
          }
          setDockThreadOpen(true)
          void sendMessage(msg, comparePreviousFromChip(msg))
        }}
        voiceSupported={voiceSupported}
        rateLimitSec={rateLimitSec}
        error={error}
        autoSpeak={autoSpeak}
        onToggleAutoSpeak={() => {
          setAutoSpeak((on) => {
            const next = !on
            saveGeminiAutoSpeak(next)
            if (next) primeGeminiSpeechPlayback()
            else stopGeminiSpeech()
            return next
          })
        }}
      />
    )
  }

  return (
    <div
      className={`gemini-panel-backdrop gemini-panel-backdrop--expanded${entered ? ' gemini-panel-backdrop--open' : ''}`}
      role="presentation"
      onClick={handleMinimize}
    >
      <aside
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-label={`${ISKRA_FULL_NAME}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gemini-panel__glow" aria-hidden />

        <div className="gemini-panel__chrome">
        <header className="gemini-panel__head">
          <div className="gemini-panel__head-main">
            <div className="gemini-panel__avatar gemini-panel__avatar--female" aria-hidden>
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="gemini-panel__title">{ISKRA_FULL_NAME}</h2>
              <p className="gemini-panel__sub muted">
                {clubName || 'Выберите клуб в шапке'}
                {clubName ? ` · ${advisorRole.labelRu}` : ''}
              </p>
            </div>
          </div>
          <div className="gemini-panel__head-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm gemini-panel__settings"
              aria-label="Свернуть в док"
              title="Свернуть — работайте с вкладками"
              onClick={handleMinimize}
            >
              <ChevronDown size={18} />
            </button>
            <Link
              to={settingsHref}
              className="btn btn-ghost btn-sm gemini-panel__settings"
              aria-label="Настройки ИСКРА"
              title="Настройки ИСКРА"
              onClick={handleClose}
            >
              <Settings size={18} />
            </Link>
            <CloseButton className="gemini-panel__close" sm onClick={handleClose} />
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
              <option value="">Продажи клуба</option>
              {trainers.map((t) => (
                <option key={t.trainer_id} value={t.trainer_id}>
                  Тренер: {t.trainer_name || t.trainer_id}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <GeminiContextKpi kpi={kpi} year={year} month={month} loading={kpiLoading} />
        {kpiLoadError ? (
          <div className="gemini-panel__kpi-retry" role="status">
            <p className="gemini-panel__kpi-retry-text muted">{kpiLoadError}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reloadKpi()} disabled={kpiLoading}>
              <RotateCcw size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Загрузить снова
            </button>
          </div>
        ) : null}

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

          <div className="gemini-panel__speak-controls">
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
                  if (next) primeGeminiSpeechPlayback()
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
          {panelQuickChips.map((chip) => {
            const ChipIcon = chipIconFor(chip)
            return (
              <button
                key={chip.id}
                type="button"
                className="gemini-panel__chip"
                disabled={loading || !clubId || rateLimitSec > 0}
                onClick={() =>
                  void sendMessage(chip.message, chip.compare === true, {
                    handlerId: chip.handler_id || undefined,
                  })
                }
              >
                <ChipIcon size={13} aria-hidden />
                {chip.label}
              </button>
            )
          })}
        </div>
        </div>

        <div className="gemini-panel__chat">
        <div className="gemini-panel__messages" ref={listRef}>
          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`gemini-panel__msg gemini-panel__msg--${msg.role}`}
            >
              {msg.role === 'assistant' ? (
                <>
                  <div className="gemini-panel__msg-avatar gemini-panel__msg-avatar--female" aria-hidden>
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
                      {!msg.incomplete ? (
                        <>
                          <button
                            type="button"
                            className={`btn btn-ghost btn-sm gemini-panel__feedback${feedbackByMsg[`a-${i}`] === 'up' ? ' gemini-panel__feedback--on' : ''}`}
                            aria-label="Полезный ответ"
                            disabled={!!feedbackByMsg[`a-${i}`]}
                            onClick={() => submitReplyFeedback(i, 'up')}
                          >
                            <ThumbsUp size={14} />
                          </button>
                          <button
                            type="button"
                            className={`btn btn-ghost btn-sm gemini-panel__feedback${feedbackByMsg[`a-${i}`] === 'down' ? ' gemini-panel__feedback--on' : ''}`}
                            aria-label="Не полезный ответ"
                            disabled={!!feedbackByMsg[`a-${i}`]}
                            onClick={() => submitReplyFeedback(i, 'down')}
                          >
                            <ThumbsDown size={14} />
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label="Озвучить"
                        onClick={() => {
                          primeGeminiSpeechPlayback()
                          void speakGeminiText(msg.content, ISKRA_TTS_GENDER)
                        }}
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
              <div className="gemini-panel__msg-avatar gemini-panel__msg-avatar--female" aria-hidden>
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
            {listening
              ? 'Слушаю… нажмите микрофон, чтобы остановить'
              : autoSpeak
                ? 'Микрофон — голосовой ввод · 🔊 автоозвучка вкл · ♀/♂ — голос TTS'
                : 'Микрофон — голосовой ввод · включите 🔊 в шапке для автоозвучки · ♀/♂ — голос TTS'}
          </p>
        ) : (
          <p className="gemini-panel__voice-hint muted">Голосовой ввод: Chrome или Edge на Android. Ответ можно озвучить 🔊</p>
        )}
        </div>
      </aside>
    </div>
  )
}
