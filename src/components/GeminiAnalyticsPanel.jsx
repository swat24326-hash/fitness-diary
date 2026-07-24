import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
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
import { resolveIskraAdvisorRole, iskraAdvisorFullAccess } from '../lib/admin/iskraAdvisorRoles.js'
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
import { saveIskraInsightChimeEnabled } from '../lib/admin/iskraInsightChime.js'
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
import { deriveReplySignalKey, normalizeLearningEvent } from '../lib/admin/iskraLearningCore.js'
import { detectOwnerFeedbackFromMessage } from '../lib/admin/iskraOwnerFeedbackDetectCore.js'
import {
  bumpInsightCardIgnoreCount,
  buildInactionDismissEvent,
  clearInsightCardIgnoreCount,
  ISKRA_INACTION_DISMISS_THRESHOLD,
} from '../lib/admin/iskraInactionLearningCore.js'
import { extractIskraSpeechSnippet } from '../lib/admin/iskraResponseModeCore.js'
import { parseIskraReplyBlocks } from '../lib/admin/iskraReplyDisplayCore.js'
import { resolveChipSendOptions } from '../lib/admin/iskraChipRoutingCore.js'
import {
  resolveSegmentAlerts,
} from '../lib/admin/iskraPanelSegmentCore.js'
import { buildTrainerInsightCards } from '../lib/admin/iskraTrainerPanelCore.js'
import { IskraInsightCards } from './iskra/IskraInsightCards.jsx'
import { IskraSparkBrief } from './iskra/IskraSparkBrief.jsx'
import { IskraOrb } from './iskra/IskraOrb.jsx'
import { useIskraOrbState } from './iskra/useIskraOrbState.js'
import { IskraAlertRibbon } from './iskra/IskraAlertRibbon.jsx'
import { IskraWeekChecklist } from './iskra/IskraWeekChecklist.jsx'
import { IskraPlanerkaFeed } from './iskra/IskraPlanerkaFeed.jsx'
import { IskraDispatchModal } from './iskra/IskraDispatchModal.jsx'
import { IskraPanelNav } from './iskra/IskraPanelNav.jsx'
import { IskraOwnerMonthBriefButton } from './iskra/IskraOwnerMonthBriefButton.jsx'
import { IskraTrainerKpi } from './iskra/IskraTrainerKpi.jsx'
import { useClubDispatchRecipients } from '../hooks/useClubDispatchRecipients.js'
import {
  buildDispatchFromProactiveAlert,
  buildWeekChecklistTaskDraft,
} from '../lib/admin/staffTaskCreateCore.js'
import '../styles/gemini-analytics.css'
import '../styles/iskra-dispatch.css'

function sparkDismissStorageKey(clubId, year, month) {
  return `fitness-diary-iskra-spark-dismiss-${clubId}-${year}-${month}`
}

function readSparkDismissed(clubId, year, month) {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(sparkDismissStorageKey(clubId, year, month)) === '1'
  } catch {
    return false
  }
}

function writeSparkDismissed(clubId, year, month) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(sparkDismissStorageKey(clubId, year, month), '1')
  } catch {
    /* ignore */
  }
}

const DEPTH_STORAGE_KEY = 'fitness-diary-iskra-response-depth'

function readResponseDepthPreference() {
  if (typeof localStorage === 'undefined') return 'standard'
  try {
    return localStorage.getItem(DEPTH_STORAGE_KEY) === 'deep' ? 'deep' : 'standard'
  } catch {
    return 'standard'
  }
}

function writeResponseDepthPreference(depth) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DEPTH_STORAGE_KEY, depth === 'deep' ? 'deep' : 'standard')
  } catch {
    /* ignore */
  }
}

function IskraMessageBody({ content }) {
  const { lead, sections, paragraphs } = parseIskraReplyBlocks(content)

  if (sections.length) {
    return (
      <div className="gemini-panel__msg-text iskra-reply">
        {lead ? <p className="iskra-reply__lead">{lead}</p> : null}
        {sections.map((section) => (
          <div key={section.label} className="iskra-reply__section">
            {section.label ? <span className="iskra-reply__label">{section.label}</span> : null}
            {section.items.length > 1 ? (
              <ol className="iskra-reply__list">
                {section.items.map((item, idx) => (
                  <li key={`${section.label}-${idx}`}>{item.replace(/^\d+\.\s*/, '')}</li>
                ))}
              </ol>
            ) : (
              <p className="iskra-reply__body">{section.items[0]}</p>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (paragraphs.length) {
    return (
      <div className="gemini-panel__msg-text iskra-reply">
        {lead ? <p className="iskra-reply__lead">{lead}</p> : null}
        {paragraphs.map((p, i) => (
          <p key={i} className="iskra-reply__body">
            {p}
          </p>
        ))}
      </div>
    )
  }

  if (lead) {
    return (
      <div className="gemini-panel__msg-text iskra-reply">
        <p className="iskra-reply__lead">{lead}</p>
      </div>
    )
  }

  return <p>{content}</p>
}

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
  const { recipients: dispatchRecipients } = useClubDispatchRecipients(clubId, { includeSalesManagers: true })
  const [focusTrainerId, setFocusTrainerId] = useState(null)
  const [panelSegment, setPanelSegment] = useState('sales')
  const [trainerContour, setTrainerContour] = useState(null)
  const [entered, setEntered] = useState(false)
  const [dockThreadOpen, setDockThreadOpen] = useState(false)
  const [hintTick, setHintTick] = useState(0)
  const [learningTick, setLearningTick] = useState(0)
  const [feedbackByMsg, setFeedbackByMsg] = useState(() => ({}))
  const [sparkBrief, setSparkBrief] = useState(null)
  const [insightCards, setInsightCards] = useState([])
  const [adviceOutcomes, setAdviceOutcomes] = useState([])
  const [sparkBriefEnabled, setSparkBriefEnabled] = useState(true)
  const [sparkBriefDismissed, setSparkBriefDismissed] = useState(false)
  const [proactiveAlerts, setProactiveAlerts] = useState([])
  const [momGlance, setMomGlance] = useState(null)
  const [forecastConfidence, setForecastConfidence] = useState(null)
  const [directionGlance, setDirectionGlance] = useState(null)
  const [planerkaFeed, setPlanerkaFeed] = useState(null)
  const [weekChecklist, setWeekChecklist] = useState([])
  const [correctionOpenFor, setCorrectionOpenFor] = useState(null)
  const [correctionText, setCorrectionText] = useState('')
  const [correctionDone, setCorrectionDone] = useState(() => ({}))
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const [dispatchCard, setDispatchCard] = useState(null)
  const [dispatchDraft, setDispatchDraft] = useState(null)
  const [responseDepth, setResponseDepth] = useState(() => readResponseDepthPreference())
  const voiceSupported = useState(() => isSpeechRecognitionSupported())[0]
  const listRef = useRef(null)
  const recognitionRef = useRef(null)
  const initialMessageSentRef = useRef(false)
  const prevModeRef = useRef(/** @type {'closed'|'compact'|'expanded'} */ ('closed'))

  const settingsHref = clubId
    ? `/admin/structure?tab=iskra-settings&club=${encodeURIComponent(clubId)}`
    : '/admin/structure?tab=iskra-settings'
  const activeTrainerId = panelSegment === 'trainer' ? focusTrainerId || null : null
  const focusTrainerLabel =
    trainers.find((t) => t.trainer_id === activeTrainerId)?.trainer_name ||
    (activeTrainerId && selectedTrainerName) ||
    ''

  const panelQuickChips = useMemo(
    () =>
      resolvePanelQuickChips({
        stored: quickChips,
        segment: panelSegment,
        trainerId: activeTrainerId,
        appRole,
      }),
    [quickChips, panelSegment, activeTrainerId, appRole],
  )

  const segmentAlerts = useMemo(
    () => resolveSegmentAlerts(proactiveAlerts, trainerContour, panelSegment, activeTrainerId),
    [proactiveAlerts, trainerContour, panelSegment, activeTrainerId],
  )

  const trainerInsightCards = useMemo(
    () => buildTrainerInsightCards(trainerContour, { trainerId: activeTrainerId, limit: 3 }),
    [trainerContour, activeTrainerId],
  )

  const displayInsightCards = panelSegment === 'trainer' ? trainerInsightCards : insightCards
  const insightCardIdsKey = (displayInsightCards ?? []).map((c) => String(c?.id ?? '')).join('|')

  const showAdminDepth = iskraAdvisorFullAccess(advisorRole)

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
    if (selectedTrainerId) {
      setFocusTrainerId(selectedTrainerId)
      setPanelSegment('trainer')
    }
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
      const focusLine = panelSegment === 'trainer' && focusTrainerLabel
        ? ` Сейчас контур тренеров (планшеты)${focusTrainerLabel ? ` — ${focusTrainerLabel}` : ''}.`
        : panelSegment === 'trainer'
          ? ' Сейчас контур тренеров (планшеты) — сводка клуба.'
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
    panelSegment,
    selectedTrainerId,
    selectedTrainerName,
    isActive,
  ])

  useEffect(() => {
    if (!clubId) {
      setSparkBriefDismissed(false)
      return
    }
    setSparkBriefDismissed(readSparkDismissed(clubId, year, month))
  }, [clubId, year, month, mode])

  const applyPrefetchPayload = useCallback((data) => {
    if (!data?.ok) return false
    setKpi(data.kpi ?? null)
    setTrainers(Array.isArray(data.trainers) ? data.trainers : [])
    setQuickChips(resolveIskraQuickChips(data.quickChips))
    setSparkBrief(data.sparkBrief ?? null)
    setInsightCards(Array.isArray(data.insightCards) ? data.insightCards : [])
    setAdviceOutcomes(Array.isArray(data.adviceOutcomes) ? data.adviceOutcomes : [])
    setSparkBriefEnabled(data.sparkBriefEnabled !== false)
    setProactiveAlerts(Array.isArray(data.proactiveAlerts) ? data.proactiveAlerts : [])
    setMomGlance(data.momGlance ?? null)
    setForecastConfidence(data.forecastConfidence ?? null)
    setDirectionGlance(data.directionGlance ?? null)
    setPlanerkaFeed(data.planerkaFeed ?? null)
    setWeekChecklist(Array.isArray(data.weekChecklist) ? data.weekChecklist : [])
    setTrainerContour(data.trainerContour ?? null)
    setKpiLoadError('')
    return true
  }, [])

  const reloadKpi = useCallback(async () => {
    if (!clubId) {
      setKpi(null)
      setTrainers([])
      setQuickChips(defaultIskraQuickChips())
      setSparkBrief(null)
      setInsightCards([])
      setAdviceOutcomes([])
      setProactiveAlerts([])
      setMomGlance(null)
      setForecastConfidence(null)
      setDirectionGlance(null)
      setPlanerkaFeed(null)
      setWeekChecklist([])
      setTrainerContour(null)
      setKpiLoadError('')
      return
    }
    setKpiLoading(true)
    setKpiLoadError('')
    const data = await prefetchGeminiSnapshot({ clubId, year, month })
    if (!applyPrefetchPayload(data)) {
      setKpi(null)
      setTrainers([])
      setQuickChips(defaultIskraQuickChips())
      setSparkBrief(null)
      setInsightCards([])
      setAdviceOutcomes([])
      setProactiveAlerts([])
      setMomGlance(null)
      setForecastConfidence(null)
      setDirectionGlance(null)
      setPlanerkaFeed(null)
      setWeekChecklist([])
      setTrainerContour(null)
      setKpiLoadError(data.error || 'Не удалось загрузить данные')
    }
    setKpiLoading(false)
  }, [clubId, year, month, applyPrefetchPayload])

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
      if (!applyPrefetchPayload(data)) {
        setKpi(null)
        setTrainers([])
        setQuickChips(defaultIskraQuickChips())
        setSparkBrief(null)
        setInsightCards([])
        setAdviceOutcomes([])
        setProactiveAlerts([])
        setMomGlance(null)
        setForecastConfidence(null)
        setDirectionGlance(null)
        setPlanerkaFeed(null)
        setWeekChecklist([])
        setKpiLoadError(data.error || 'Не удалось загрузить данные')
      }
      setKpiLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [mode, clubId, year, month, applyPrefetchPayload])

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
  const orbState = useIskraOrbState(listening, loading, { chime: true })

  const panelClass = `gemini-panel gemini-panel--female gemini-panel--fullscreen${entered ? ' gemini-panel--open' : ''}`

  useEffect(() => {
    if (mode !== 'expanded') return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mode])

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

  useEffect(() => {
    if (!clubId || !insightCardIdsKey) return
    for (const card of displayInsightCards ?? []) {
      const id = String(card?.id ?? '').trim()
      if (!id) continue
      const count = bumpInsightCardIgnoreCount(clubId, id, 1)
      if (count > 0 && count % ISKRA_INACTION_DISMISS_THRESHOLD === 0) {
        recordLearning({
          eventType: 'inaction_dismiss',
          signalKey: `inaction:insight_card_${id}`,
          note: `Карточку «${card.headline || id}» часто видят без действия — предлагай реже или иначе.`,
          meta: { source: 'inaction', kind: 'insight_card', target_id: id },
        })
      }
    }
  }, [clubId, year, month, panelSegment, insightCardIdsKey, displayInsightCards, recordLearning])

  const sendMessage = useCallback(
    async (text, comparePrevious = false, opts = {}) => {
      const isRetry = opts.retry === true
      const completionRetry = opts.completionRetry === true
      const handlerId = opts.handlerId ? String(opts.handlerId).trim() : undefined
      const userMessage = String(text ?? '').trim()
      if (!userMessage || !clubId || loading) return
      if (rateLimitSec > 0 && !completionRetry) return

      const compare = resolveGeminiComparePrevious({ userMessage, comparePrevious })

      // Жест пользователя: разблокировать neural Audio до долгого ответа Gemini.
      if (autoSpeak) primeGeminiSpeechPlayback()

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

      const responseMode = opts.responseMode ?? (handlerId ? 'brief' : responseDepth)

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
          panelSegment,
          handlerId,
          appRole,
          responseMode,
          inputChannel: opts.inputChannel,
          coachQualityBrief: opts.coachQualityBrief,
        })

      if (handlerId && !completionRetry) {
        recordLearning({
          eventType: 'chip_click',
          handlerId,
          userMessage,
        })
      }

      if (opts.inputChannel === 'voice' && !completionRetry) {
        const voiceHits = detectOwnerFeedbackFromMessage(userMessage)
        for (const hit of voiceHits) {
          recordLearning({
            eventType: 'preference',
            signalKey: hit.signal_key,
            note: hit.note,
            userMessage,
            meta: { source: 'voice', kind: hit.kind },
          })
        }
      }

      try {
        let data = await fetchReply({
          skipCache: completionRetry,
          forceGemini: completionRetry,
          completionRetry,
        })
        let reply = String(data?.text ?? '').trim()
        const replyMode = String(data?.response_mode ?? responseMode).trim() || responseMode
        let incomplete = data?.incomplete === true || isGeminiReplyIncomplete(reply, undefined, replyMode)

        if (incomplete && !completionRetry) {
          try {
            data = await fetchReply({ skipCache: true, forceGemini: true, completionRetry: true })
            reply = String(data?.text ?? '').trim()
            incomplete = isGeminiReplyIncomplete(reply, undefined, String(data?.response_mode ?? replyMode))
          } catch {
            /* оставляем первый ответ или ошибку ниже */
          }
        }

        const replyMeta = {
          source: data?.source,
          chip_id: data?.chip_id,
          intro_kind: data?.intro_kind,
          handler_id: handlerId,
          response_mode: data?.response_mode ?? replyMode,
          source_facts: Array.isArray(data?.source_facts) ? data.source_facts : undefined,
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
          primeGeminiSpeechPlayback()
          const speakText = extractIskraSpeechSnippet(reply, replyMode)
          window.setTimeout(() => {
            void speakGeminiText(speakText, ISKRA_TTS_GENDER)
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
    [clubId, year, month, chatHistory, loading, stopListening, autoSpeak, rateLimitSec, activeTrainerId, panelSegment, appRole, recordLearning, responseDepth],
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
      if (vote === 'down') {
        setCorrectionOpenFor(msgIndex)
        setCorrectionText('')
      }
    },
    [messages, feedbackByMsg, recordLearning],
  )

  const submitCorrection = useCallback(
    (msgIndex) => {
      const note = String(correctionText ?? '').trim()
      if (!note || correctionDone[`a-${msgIndex}`]) return
      const msg = messages[msgIndex]
      if (!msg || msg.role !== 'assistant') return

      let userText = ''
      for (let j = msgIndex - 1; j >= 0; j--) {
        if (messages[j].role === 'user') {
          userText = messages[j].content
          break
        }
      }

      recordLearning({
        eventType: 'correction',
        signalKey: msg.meta?.signal_key,
        userMessage: userText,
        chipId: msg.meta?.chip_id,
        handlerId: msg.meta?.handler_id,
        introKind: msg.meta?.intro_kind,
        note,
        meta: { source: msg.meta?.source, reply_preview: String(msg.content ?? '').slice(0, 200) },
      })
      setCorrectionDone((prev) => ({ ...prev, [`a-${msgIndex}`]: true }))
      setCorrectionOpenFor(null)
      setCorrectionText('')
    },
    [correctionText, correctionDone, messages, recordLearning],
  )

  const runAlertAction = useCallback(
    (alert) => {
      if (!alert) return
      const message = String(alert.ctaMessage ?? '').trim()
      const handlerId = alert.handlerId
      if (!message) return
      recordLearning({
        eventType: 'chip_click',
        handlerId,
        userMessage: message,
        meta: { source: 'proactive_alert', alert_id: alert.id },
      })
      const routed = resolveChipSendOptions(
        { handler_id: handlerId },
        { advisorRoleId: advisorRole.id, responseDepth },
      )
      void sendMessage(message, false, routed)
    },
    [sendMessage, recordLearning, advisorRole.id, responseDepth],
  )

  const runChecklistItem = useCallback(
    (item) => {
      if (!item) return
      const message = String(item.message ?? '').trim()
      const handlerId = item.handlerId
      if (!message) return
      recordLearning({
        eventType: 'chip_click',
        handlerId,
        userMessage: message,
        meta: { source: 'week_checklist', item_id: item.id },
      })
      const routed = resolveChipSendOptions(
        { handler_id: handlerId },
        { advisorRoleId: advisorRole.id, responseDepth },
      )
      void sendMessage(message, false, routed)
    },
    [sendMessage, recordLearning, advisorRole.id, responseDepth],
  )

  const showSparkBrief = sparkBriefEnabled && sparkBrief && !sparkBriefDismissed && !kpiLoading

  const dismissSparkBrief = useCallback(() => {
    if (clubId) {
      writeSparkDismissed(clubId, year, month)
      const raw = buildInactionDismissEvent({
        clubId,
        kind: 'spark_brief',
        targetId: sparkBrief?.cta?.cardId || 'brief',
        advisorRoleId: advisorRole.id,
      })
      if (raw) {
        const n = normalizeLearningEvent(raw)
        if (n.ok) {
          recordLearning({
            eventType: 'inaction_dismiss',
            signalKey: n.event.signal_key,
            note: n.event.note,
            meta: n.event.meta,
          })
        }
      }
    }
    setSparkBriefDismissed(true)
  }, [clubId, year, month, sparkBrief, advisorRole.id, recordLearning])

  const runInsightAction = useCallback(
    (card) => {
      if (!card) return
      if (clubId && card.id) clearInsightCardIgnoreCount(clubId, card.id)
      const message = String(card.doMessage ?? card.message ?? '').trim()
      const handlerId = card.doHandlerId ?? card.handler_id ?? card.handlerId
      if (!message) return
      recordLearning({
        eventType: 'chip_click',
        handlerId,
        userMessage: message,
        meta: { source: 'insight_card', card_id: card.id },
      })
      const routed = resolveChipSendOptions(
        { handler_id: handlerId },
        { advisorRoleId: advisorRole.id, responseDepth },
      )
      void sendMessage(message, false, routed)
    },
    [sendMessage, recordLearning, advisorRole.id, responseDepth, clubId],
  )

  const runSparkCta = useCallback(() => {
    if (!sparkBrief?.cta) return
    runInsightAction({
      id: sparkBrief.cta.cardId,
      doMessage: sparkBrief.cta.message,
      doHandlerId: sparkBrief.cta.handlerId,
    })
  }, [sparkBrief, runInsightAction])

  const openDispatchFromCard = useCallback((card) => {
    if (!card) return
    setDispatchCard(card)
    setDispatchDraft(null)
    setDispatchOpen(true)
  }, [])

  const openDispatchFromAlert = useCallback(
    (alert) => {
      if (!alert || alert.severity === 'ok') return
      setDispatchCard(null)
      setDispatchDraft(
        buildDispatchFromProactiveAlert(alert, {
          clubId,
          clubName,
          year,
          month,
        }),
      )
      setDispatchOpen(true)
    },
    [clubId, clubName, year, month],
  )

  const openDispatchFromChecklist = useCallback(
    (item) => {
      if (!item || !clubId) return
      setDispatchCard(null)
      setDispatchDraft(buildWeekChecklistTaskDraft(item, { clubId, year, month }))
      setDispatchOpen(true)
    },
    [clubId, year, month],
  )

  const sendChipMessage = useCallback(
    (chip) => {
      const routed = resolveChipSendOptions(chip, {
        advisorRoleId: advisorRole.id,
        responseDepth,
      })
      void sendMessage(chip.message, chip.compare === true, routed)
    },
    [advisorRole.id, responseDepth, sendMessage],
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
        void sendMessage(text, false, { inputChannel: 'voice' })
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
      <div className="iskra-compact-stack">
        <IskraAlertRibbon
          alerts={proactiveAlerts}
          disabled={loading || !clubId || rateLimitSec > 0}
          onAlertAction={runAlertAction}
          onAlertAssign={openDispatchFromAlert}
        />
        {showSparkBrief ? (
          <IskraSparkBrief
            brief={sparkBrief}
            kpi={kpi}
            compact
            onCta={runSparkCta}
            onDismiss={dismissSparkBrief}
          />
        ) : null}
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
            saveIskraInsightChimeEnabled(next)
            if (next) primeGeminiSpeechPlayback()
            else stopGeminiSpeech()
            return next
          })
        }}
        />
      </div>
    )
  }

  return (
    <>
    <div
      className={`gemini-panel-backdrop gemini-panel-backdrop--fullscreen${entered ? ' gemini-panel-backdrop--open' : ''}`}
      role="presentation"
      onClick={handleClose}
    >
      <aside
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-label={`${ISKRA_FULL_NAME}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gemini-panel__aurora" aria-hidden>
          <span className="gemini-panel__aurora-blob gemini-panel__aurora-blob--1" />
          <span className="gemini-panel__aurora-blob gemini-panel__aurora-blob--2" />
          <span className="gemini-panel__aurora-blob gemini-panel__aurora-blob--3" />
        </div>
        <div className="gemini-panel__glow" aria-hidden />

        <header className="gemini-panel__head gemini-panel__head--fullscreen">
          <div className="gemini-panel__head-main">
            <IskraOrb state={orbState} size={44} className="gemini-panel__avatar gemini-panel__avatar--orb" />
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
              title="Свернуть в компактный док"
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

        <div className="gemini-panel__scene">
        <div className="gemini-panel__insights">
        <IskraPanelNav
          segment={panelSegment}
          onSegmentChange={setPanelSegment}
          year={year}
          month={month}
          onYearMonthChange={(y, m) => {
            setYear(y)
            setMonth(m)
          }}
          trainers={trainers}
          trainerId={activeTrainerId}
          onTrainerChange={setFocusTrainerId}
          responseDepth={responseDepth}
          onResponseDepthChange={(depth) => {
            setResponseDepth(depth)
            writeResponseDepthPreference(depth)
          }}
          showDepthControls={showAdminDepth}
          autoSpeak={autoSpeak}
          onAutoSpeakToggle={() => {
            setAutoSpeak((on) => {
              const next = !on
              saveGeminiAutoSpeak(next)
              saveIskraInsightChimeEnabled(next)
              if (next) primeGeminiSpeechPlayback()
              else stopGeminiSpeech()
              return next
            })
          }}
          disabled={loading}
          briefSlot={
            panelSegment === 'sales' ? (
              <IskraOwnerMonthBriefButton
                clubName={clubName}
                periodLabel={periodLabelRu(year, month)}
                kpi={kpi}
                sparkBrief={sparkBrief}
                insightCards={insightCards}
                momGlance={momGlance}
                forecastConfidence={forecastConfidence}
                outcomes={adviceOutcomes}
                disabled={loading || kpiLoading}
              />
            ) : null
          }
        />

        {panelSegment === 'sales' ? (
          <>
            <GeminiContextKpi kpi={kpi} year={year} month={month} loading={kpiLoading} />
            {directionGlance?.line ? (
              <p className="iskra-direction-glance muted" role="note">
                {directionGlance.line}
              </p>
            ) : null}
            {momGlance?.line ? (
              <p className="iskra-mom-glance muted" role="note">
                {momGlance.line}
              </p>
            ) : null}
            {!showSparkBrief && (forecastConfidence?.line || sparkBrief?.forecastLine) ? (
              <p
                className={`iskra-forecast-glance muted iskra-forecast-glance--${forecastConfidence?.confidence ?? sparkBrief?.forecastConfidence ?? 'medium'}`}
                role="note"
              >
                {forecastConfidence?.line ?? sparkBrief?.forecastLine}
              </p>
            ) : null}
            {showSparkBrief ? (
              <IskraSparkBrief
                brief={sparkBrief}
                kpi={kpi}
                onCta={runSparkCta}
                onDismiss={dismissSparkBrief}
              />
            ) : null}
            <IskraWeekChecklist
              clubId={clubId}
              year={year}
              month={month}
              items={weekChecklist}
              disabled={loading || !clubId || rateLimitSec > 0}
              onRunItem={runChecklistItem}
              onAssignItem={openDispatchFromChecklist}
            />
          </>
        ) : (
          <IskraTrainerKpi
            contour={trainerContour}
            trainerId={activeTrainerId}
            loading={kpiLoading}
          />
        )}

        <IskraAlertRibbon
          alerts={segmentAlerts}
          disabled={loading || !clubId || rateLimitSec > 0}
          onAlertAction={runAlertAction}
          onAlertAssign={openDispatchFromAlert}
        />
        <IskraPlanerkaFeed feed={planerkaFeed} clubId={clubId} loading={kpiLoading} />
        <IskraInsightCards
          cards={displayInsightCards}
          loading={kpiLoading}
          disabled={loading || !clubId || rateLimitSec > 0}
          onDo={runInsightAction}
          onDispatch={panelSegment === 'sales' ? openDispatchFromCard : undefined}
          dispatchDisabled={!trainers.length || panelSegment !== 'sales'}
        />
        {kpiLoadError ? (
          <div className="gemini-panel__kpi-retry" role="status">
            <p className="gemini-panel__kpi-retry-text muted">{kpiLoadError}</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reloadKpi()} disabled={kpiLoading}>
              <RotateCcw size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Загрузить снова
            </button>
          </div>
        ) : null}
        </div>

        <div className="gemini-panel__chat gemini-panel__chat--fullscreen">
        <div className="gemini-panel__chips gemini-panel__chips--chat">
          {panelQuickChips.map((chip) => {
            const ChipIcon = chipIconFor(chip)
            return (
              <button
                key={chip.id}
                type="button"
                className="gemini-panel__chip"
                disabled={loading || !clubId || rateLimitSec > 0}
                onClick={() => sendChipMessage(chip)}
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
                  <div className="gemini-panel__msg-avatar gemini-panel__msg-avatar--female" aria-hidden>
                    {personaShort}
                  </div>
                  <div className="gemini-panel__msg-body">
                    <span className="gemini-panel__msg-name">{personaLabel}</span>
                    <IskraMessageBody content={msg.content} />
                    {msg.meta?.source_facts?.length ? (
                      <ul className="iskra-source-facts muted" aria-label="Источники цифр">
                        {msg.meta.source_facts.map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                      </ul>
                    ) : null}
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
                          void speakGeminiText(
                            extractIskraSpeechSnippet(msg.content, msg.meta?.response_mode ?? responseDepth),
                            ISKRA_TTS_GENDER,
                          )
                        }}
                      >
                        <Volume2 size={14} />
                      </button>
                    </div>
                    {feedbackByMsg[`a-${i}`] === 'down' && !correctionDone[`a-${i}`] ? (
                      <div className="iskra-correction">
                        {correctionOpenFor === i ? (
                          <>
                            <label className="iskra-correction__label" htmlFor={`iskra-correction-${i}`}>
                              Что не так в ответе?
                            </label>
                            <textarea
                              id={`iskra-correction-${i}`}
                              className="input iskra-correction__input"
                              rows={2}
                              value={correctionText}
                              placeholder="Например: цифра плана неверная"
                              onChange={(e) => setCorrectionText(e.target.value)}
                            />
                            <div className="iskra-correction__actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={!correctionText.trim()}
                                onClick={() => submitCorrection(i)}
                              >
                                Отправить исправление
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setCorrectionOpenFor(null)
                                  setCorrectionText('')
                                }}
                              >
                                Отмена
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm iskra-correction__open"
                            onClick={() => {
                              setCorrectionOpenFor(i)
                              setCorrectionText('')
                            }}
                          >
                            Исправить ответ
                          </button>
                        )}
                      </div>
                    ) : null}
                    {correctionDone[`a-${i}`] ? (
                      <p className="iskra-correction__done muted">Запомнила — следующие ответы учтут правку</p>
                    ) : null}
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
        </div>
      </aside>
    </div>
    <IskraDispatchModal
      open={dispatchOpen}
      onClose={() => {
        setDispatchOpen(false)
        setDispatchDraft(null)
        setDispatchCard(null)
      }}
      clubId={clubId}
      clubName={clubName}
      year={year}
      month={month}
      trainers={trainers}
      recipients={dispatchRecipients}
      defaultCard={dispatchCard}
      defaultDraft={dispatchDraft}
      defaultRecipientId={activeTrainerId ?? ''}
      baselineMetrics={
        kpi
          ? {
              planPct: kpi.planPct,
              profitTotal: kpi.profitTotal,
              impactRub: dispatchCard?.impactRub ?? null,
            }
          : null
      }
      onSent={() => void reloadKpi()}
    />
    </>
  )
}
