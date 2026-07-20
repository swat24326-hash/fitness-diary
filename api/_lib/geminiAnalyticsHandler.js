import { readEnv, sendJson } from './adminSupabase.js'
import { loadClubIskraSettings } from './iskraSettingsHandler.js'
import { getCachedGeminiSnapshot } from './geminiAnalyticsCache.js'
import { loadGeminiAnalyticsContext, loadGeminiSnapshotForMonth } from './geminiAnalyticsData.js'
import {
  buildGeminiGeneratePayload,
  callGeminiGenerateContent,
} from './geminiApiClient.js'
import {
  getCachedGeminiResponse,
  setCachedGeminiResponse,
} from './geminiAnalyticsResponseCache.js'
import {
  buildPersona,
  buildGeminiPromptDataBlock,
  formatGeminiUserError,
  isGeminiReplyIncomplete,
  resolveGeminiComparePrevious,
} from '../../src/lib/admin/geminiAnalyticsPrompt.js'
import {
  buildGeminiInstantReply,
} from '../../src/lib/admin/geminiInstantReplies.js'
import { resolveInstantHandlerId } from '../../src/lib/admin/iskraQuickChipsCore.js'
import { applyTrainerFocusToSnapshot, compactTrainerContourForPrompt } from '../../src/lib/admin/geminiTrainerContour.js'
import {
  isTrainerFocusedQuestion,
  resolveTrainerIdFromMessage,
} from '../../src/lib/admin/iskraTrainerRouting.js'
import {
  buildGeminiIntroReply,
  matchGeminiIntroIntent,
} from '../../src/lib/admin/geminiAssistantIntro.js'
import { isIskraOffTopicQuestion, normalizeIskraOffTopicReply } from '../../src/lib/admin/iskraQuestionRouting.js'
import { matchIskraAdviceIntent } from '../../src/lib/admin/iskraBusinessAdvice.js'
import { matchIskraAppGuideIntent } from '../../src/lib/admin/iskraAppGuide.js'
import {
  buildAdvisorMetaForResponse,
  buildAdvisorPromptAppend,
  buildIskraAdvisorContext,
} from '../../src/lib/admin/iskraAdvisorPipeline.js'
import { mapAppRoleToAdvisorRole } from '../../src/lib/admin/iskraAdvisorScope.js'
import {
  buildIskraLearningContext,
  buildLearningMetaForResponse,
  mergeLearningIntoPromptAppend,
} from '../../src/lib/admin/iskraLearningPipeline.js'
import { loadClubLearningBundle, persistClubLearningEvent } from './iskraLearningHandler.js'
import {
  shouldKeepClubContextOnOffTopic,
  shouldUseAdminJarvisMode,
} from '../../src/lib/admin/iskraAdminJarvisCore.js'
import {
  buildOwnerFeedbackPromptAppend,
  detectOwnerFeedbackFromMessage,
  ownerFeedbackHitToLearningEvent,
} from '../../src/lib/admin/iskraOwnerFeedbackDetectCore.js'
import {
  buildClarifyingPromptRule,
  findPendingClarifyingQuestion,
  parseClarifyingAnswer,
  resolveIskraClarifyingAsk,
} from '../../src/lib/admin/iskraClarifyingCore.js'
import {
  adviceOutcomeToLearningEvent,
  buildAdviceOutcomeSparkLine,
  buildAdviceOutcomesPromptBlock,
  extractAdviceOutcomes,
  settleOpenAdviceBaselines,
} from '../../src/lib/admin/iskraAdviceOutcomeCore.js'
import { buildPastSelfComparison } from '../../src/lib/admin/iskraPastSelfCore.js'
import { buildModelCeilingPromptRule, estimateIskraModelCeiling } from '../../src/lib/admin/iskraModelCeilingCore.js'
import { buildIskraDataAvailability } from '../../src/lib/admin/iskraDataAvailability.js'
import { periodLabelRu, trimChatHistory } from '../../src/lib/admin/geminiAnalyticsSnapshot.js'
import { buildPanelKpiFromAnalytics } from '../../src/lib/admin/clubMonthAnalyticsCore.js'
import { buildEnrichedIskraAdviceCards } from '../../src/lib/admin/iskraActionImpactCore.js'
import { buildIskraSparkBrief } from '../../src/lib/admin/iskraSparkBriefCore.js'
import {
  resolveAdviceCardLimit,
  resolveIskraResponseMode,
  shouldSkipGeminiEdge,
  iskraAdminRichContext,
} from '../../src/lib/admin/iskraResponseModeCore.js'
import { loadClubOpenDispatchForPrompt, loadClubPlanerkaFeed } from './iskraDispatchQuery.js'
import { deriveSourceFactsForReply } from '../../src/lib/admin/iskraReplySourceFactsCore.js'
import { buildIskraProactiveAlerts } from '../../src/lib/admin/iskraProactiveAlertsCore.js'
import { shouldLoadPreviousMonthSnapshot } from '../../src/lib/admin/iskraMonthMemoryCore.js'
import { buildForecastConfidenceLine } from '../../src/lib/admin/iskraForecastConfidenceCore.js'
import { buildMomGlanceLine } from '../../src/lib/admin/iskraMomGlanceCore.js'
import { buildWeekChecklistItems } from '../../src/lib/admin/iskraWeekChecklistCore.js'
import { applyMonthComparisonInsights } from '../../src/lib/admin/clubMonthAnalyticsCore.js'
import { shouldRouteChipToGemini } from '../../src/lib/admin/iskraChipRoutingCore.js'
import { buildDirectionGlanceLine } from '../../src/lib/admin/iskraSalesAdviceContextCore.js'
import { previousMonthParts } from '../../src/lib/admin/geminiAnalyticsSnapshot.js'

const rateLimitMs = 12000
const lastByUser = new Map()

function parseYearMonth(input) {
  const year = Math.trunc(Number(input?.year))
  const month = Math.trunc(Number(input?.month))
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null
  if (!Number.isFinite(month) || month < 1 || month > 12) return null
  return { year, month }
}

function parseClubYearMonth(bodyOrQuery) {
  const clubId = String(bodyOrQuery?.club_id ?? '').trim()
  const ym = parseYearMonth(bodyOrQuery)
  if (!clubId || !ym) return null
  return { clubId, ...ym }
}

/**
 * @param {object} payload
 * @param {object | null | undefined} snapshot
 * @param {string} userMessage
 * @param {{ chipId?: string, handlerId?: string }} [meta]
 */
function attachSourceFacts(payload, snapshot, userMessage, meta = {}) {
  const source_facts = deriveSourceFactsForReply(snapshot, userMessage, meta)
  if (source_facts.length) payload.source_facts = source_facts
  return payload
}

async function tryEdgeGemini(authHeader, payload) {
  const { url, anonKey } = readEnv()
  if (!url) return null
  const edgeUrl = `${url.replace(/\/$/, '')}/functions/v1/gemini-analytics`
  try {
    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data?.text) return { ok: true, data }
    if (data?.error) return { ok: false, error: String(data.error) }
    return { ok: false, error: null }
  } catch {
    return null
  }
}

async function callGeminiForReply(authHeader, geminiPayload, edgeBody, apiKey, opts = {}) {
  let text = ''
  let source = 'vercel'
  let edgeResult = null

  if (!opts.skipEdge) {
    edgeResult = await tryEdgeGemini(authHeader, edgeBody)
    if (edgeResult?.ok && edgeResult.data?.text) {
      const edgeText = String(edgeResult.data.text)
      if (!isGeminiReplyIncomplete(edgeText, undefined, geminiPayload.responseMode ?? 'brief')) {
        text = edgeText
        source = 'edge'
      }
    }
  }

  if (!text) {
    const gemini = await callGeminiGenerateContent(apiKey, geminiPayload)
    text = gemini.text
    if (edgeResult?.ok || edgeResult?.error) source = 'vercel'
  }

  return { text, source }
}

/**
 * GET — прогрев snapshot-кэша (без Gemini).
 * @param {object} ctx
 * @param {object} req
 * @param {object} res
 */
export async function handleGeminiAnalyticsPrefetchGet(ctx, req, res) {
  const parsed = parseClubYearMonth(req.query)
  if (!parsed) {
    sendJson(res, 400, { error: 'Укажите club_id, year и month' })
    return
  }

  try {
    const snapshot = await loadGeminiSnapshotForMonth(
      ctx.supabaseAdmin,
      parsed.clubId,
      parsed.year,
      parsed.month,
      {},
    )
    let quickChips = null
    let sparkBriefEnabled = true
    try {
      const settings = await loadClubIskraSettings(ctx.supabaseAdmin, parsed.clubId)
      quickChips = settings.quick_chips
      sparkBriefEnabled = settings.spark_brief_enabled !== false
    } catch {
      quickChips = null
      sparkBriefEnabled = true
    }
    const kpi = buildPanelKpiFromAnalytics(snapshot)
    const prevParts = previousMonthParts(parsed.year, parsed.month)
    if (prevParts) {
      try {
        const prevSnap = await loadGeminiSnapshotForMonth(
          ctx.supabaseAdmin,
          parsed.clubId,
          prevParts.year,
          prevParts.month,
          {},
        )
        applyMonthComparisonInsights(snapshot, prevSnap)
      } catch {
        /* mom optional */
      }
    }
    const insightCards = buildEnrichedIskraAdviceCards(snapshot, { advisorRoleId: 'app_admin', limit: 3 })

    let learningBundle = { signals: [], playbooks: [], phase: 'collect' }
    try {
      learningBundle = await loadClubLearningBundle(ctx.supabaseAdmin, parsed.clubId)
    } catch {
      learningBundle = { signals: [], playbooks: [], phase: 'collect' }
    }
    const settled = settleOpenAdviceBaselines(learningBundle.signals, snapshot)
    for (const outcome of settled) {
      const raw = adviceOutcomeToLearningEvent(outcome, { clubId: parsed.clubId })
      if (raw) void persistClubLearningEvent(ctx.supabaseAdmin, raw)
    }
    const outcomes = [
      ...extractAdviceOutcomes(learningBundle.signals),
      ...settled,
    ]
    const outcomeLine = buildAdviceOutcomeSparkLine(outcomes)
    const pastSelf = buildPastSelfComparison(snapshot, { outcomes })
    const sparkBrief = buildIskraSparkBrief(snapshot, {
      advisorRoleId: 'app_admin',
      clubName: snapshot.club_name,
      outcomeLine: outcomeLine ?? pastSelf?.line ?? undefined,
      hour: new Date().getHours(),
    })
    const proactiveAlerts = buildIskraProactiveAlerts(snapshot, kpi, {
      outcomeLine,
      pastSelfLine: pastSelf?.line ?? null,
    })
    const momGlance = buildMomGlanceLine(snapshot)
    const forecastConfidence = buildForecastConfidenceLine(snapshot)
    const weekChecklist = buildWeekChecklistItems(snapshot, { limit: 3 })
    const directionGlance = buildDirectionGlanceLine(snapshot)
    let planerkaFeed = { summary: { active_count: 0 }, items: [] }
    try {
      planerkaFeed = await loadClubPlanerkaFeed(ctx.supabaseAdmin, parsed.clubId)
    } catch {
      planerkaFeed = { summary: { active_count: 0 }, items: [] }
    }
    sendJson(res, 200, {
      ok: true,
      warmed: true,
      club_id: parsed.clubId,
      year: parsed.year,
      month: parsed.month,
      period: snapshot.period?.label ?? periodLabelRu(parsed.year, parsed.month),
      kpi,
      spark_brief: sparkBrief,
      spark_brief_enabled: sparkBriefEnabled,
      proactive_alerts: proactiveAlerts,
      mom_glance: momGlance,
      forecast_confidence: forecastConfidence,
      week_checklist: weekChecklist,
      direction_glance: directionGlance,
      planerka_feed: planerkaFeed,
      insight_cards: insightCards.map((c) => ({
        id: c.id,
        headline: c.headline,
        action: c.action,
        evidence: c.evidence,
        impactRub: c.impactRub,
        impactLabel: c.impactLabel,
        doHandlerId: c.doHandlerId,
        doMessage: c.doMessage,
        doLabel: c.doLabel,
        tone: c.tone,
        priority: c.priority,
      })),
      advice_outcomes: outcomes.slice(0, 4).map((o) => ({
        card_id: o.card_id,
        plan_delta_pct: o.plan_delta_pct,
        profit_delta_rub: o.profit_delta_rub,
        label_ru: o.label_ru,
      })),
      trainers: (snapshot.trainer_contour?.trainers ?? []).map((t) => ({
        trainer_id: t.trainer_id,
        trainer_name: t.trainer_name,
      })),
      trainer_contour: compactTrainerContourForPrompt(snapshot.trainer_contour),
      quick_chips: quickChips,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка prefetch' })
  }
}

/**
 * Persist NL preference hits into club learning signals (best-effort).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {Array<{ kind: string, note: string, signal_key: string }>} hits
 * @param {string} advisorRoleId
 * @param {string} userMessage
 */
async function persistOwnerFeedbackHits(supabaseAdmin, clubId, hits, advisorRoleId, userMessage) {
  if (!supabaseAdmin || !hits?.length) return
  for (const hit of hits) {
    const raw = ownerFeedbackHitToLearningEvent(hit, {
      clubId,
      advisorRoleId,
      userMessage,
    })
    if (!raw) continue
    await persistClubLearningEvent(supabaseAdmin, raw)
  }
}

/**
 * @param {object} ctx from requireAdmin
 * @param {object} req
 * @param {object} res
 * @param {object} body
 */
export async function handleGeminiAnalyticsPost(ctx, req, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  const ym = parseYearMonth(body)
  const gender = body?.gender === 'female' ? 'female' : 'male'
  const userMessage = String(body?.user_message ?? '').trim()
  const comparePrevious = resolveGeminiComparePrevious({
    userMessage,
    comparePrevious: body?.compare_previous === true,
  })
  const includeFinance = body?.include_finance !== false
  const selectedTrainerId = String(body?.selected_trainer_id ?? '').trim() || null
  const panelSegment = String(body?.panel_segment ?? '').trim() === 'trainer' ? 'trainer' : 'sales'
  const appRole = String(body?.app_role ?? ctx.user?.role ?? 'admin').trim() || 'admin'
  const offTopicQuestion = isIskraOffTopicQuestion(userMessage)
  const skipCache = body?.skip_cache === true || body?.force_gemini === true || offTopicQuestion
  const completionRetry = body?.completion_retry === true
  const responseModePref = String(body?.response_mode ?? '').trim() || null

  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (!ym) {
    sendJson(res, 400, { error: 'Укажите year и month' })
    return
  }
  if (!userMessage) {
    sendJson(res, 400, { error: 'Укажите user_message' })
    return
  }

  const userId = String(ctx.user?.id ?? '')
  const now = Date.now()
  if (!completionRetry) {
    const last = lastByUser.get(userId) || 0
    const waitMs = last + rateLimitMs - now
    if (waitMs > 0) {
      sendJson(res, 429, {
        error: 'Подождите несколько секунд перед следующим вопросом',
        retry_after_sec: Math.ceil(waitMs / 1000),
      })
      return
    }
    lastByUser.set(userId, now)
  }

  try {
    const responseModeForCache = resolveIskraResponseMode({
      advisorRoleId: mapAppRoleToAdvisorRole(appRole),
      userMessage,
      explicitMode: responseModePref,
      userPreference: responseModePref,
      comparePrevious,
    })

    const explicitHandlerId = String(body?.handler_id ?? '').trim() || null

    if (!skipCache) {
      const cached = getCachedGeminiResponse(
        clubId,
        ym.year,
        ym.month,
        gender,
        comparePrevious,
        userMessage,
        responseModeForCache,
      )
      if (cached) {
        const persona = buildPersona(gender)
        const snap = getCachedGeminiSnapshot(clubId, ym.year, ym.month, includeFinance)
        sendJson(res, 200, attachSourceFacts({
          text: cached,
          persona: persona.name,
          club_name: snap?.club_name ?? '',
          year: ym.year,
          month: ym.month,
          source: 'cache',
          compare_previous: comparePrevious,
          cached: true,
          response_mode: responseModeForCache,
        }, snap, userMessage, { handlerId: explicitHandlerId }))
        return
      }
    }

    const { snapshot, previousSnapshot, clubName } = await loadGeminiAnalyticsContext(
      ctx.supabaseAdmin,
      clubId,
      ym.year,
      ym.month,
      {
        comparePrevious,
        includePreviousMonth: shouldLoadPreviousMonthSnapshot({ comparePrevious, responseMode: responseModeForCache }),
        includeFinance,
      },
    )

    const needsRichPrompt = iskraAdminRichContext(responseModeForCache)
    let dispatchOpen = []

    const advisorCtx = buildIskraAdvisorContext({ appRole, snapshot })
    const scopedSnapshot = advisorCtx.snapshot ?? snapshot
    const advisorMeta = buildAdvisorMetaForResponse(advisorCtx)

    let promptAppend = ''
    let quickChipsStored = null
    let learningBundle = { signals: [], playbooks: [], phase: 'collect' }
    try {
      const settings = await loadClubIskraSettings(ctx.supabaseAdmin, clubId)
      promptAppend = settings.prompt_append
      quickChipsStored = settings.quick_chips
    } catch {
      promptAppend = ''
      quickChipsStored = null
    }
    try {
      learningBundle = await loadClubLearningBundle(ctx.supabaseAdmin, clubId)
    } catch {
      learningBundle = { signals: [], playbooks: [], phase: 'collect' }
    }
    if (needsRichPrompt) {
      try {
        dispatchOpen = await loadClubOpenDispatchForPrompt(ctx.supabaseAdmin, clubId)
      } catch {
        dispatchOpen = []
      }
    }
    const learningCtx = buildIskraLearningContext({ learningBundle })
    const learningMeta = buildLearningMetaForResponse(learningCtx)
    promptAppend = mergeLearningIntoPromptAppend(
      [promptAppend, buildAdvisorPromptAppend(advisorCtx)].filter(Boolean).join('\n\n'),
      learningCtx,
    )

    const jarvisMode = shouldUseAdminJarvisMode({
      advisorRoleId: advisorCtx.advisorRoleId,
      responseMode: responseModeForCache,
    })
    const voiceSource = String(body?.input_channel ?? body?.meta?.source ?? '').trim() === 'voice'
    const chatMessagesEarly = Array.isArray(body?.messages) ? body.messages : []
    const ownerFeedbackHits = jarvisMode ? detectOwnerFeedbackFromMessage(userMessage) : []
    const pendingClarify = jarvisMode ? findPendingClarifyingQuestion(chatMessagesEarly) : null
    const clarifyAnswer = jarvisMode ? parseClarifyingAnswer(userMessage, pendingClarify) : null
    if (clarifyAnswer) {
      ownerFeedbackHits.push(clarifyAnswer)
    }
    if (ownerFeedbackHits.length) {
      promptAppend = [promptAppend, buildOwnerFeedbackPromptAppend(ownerFeedbackHits)]
        .filter(Boolean)
        .join('\n\n')
      void persistOwnerFeedbackHits(
        ctx.supabaseAdmin,
        clubId,
        ownerFeedbackHits,
        advisorCtx.advisorRoleId,
        userMessage,
      )
    }

    const clarifyingAsk = resolveIskraClarifyingAsk({
      jarvis: jarvisMode,
      learningBundle,
      messages: chatMessagesEarly,
      userMessage,
    })
    if (clarifyingAsk.ask && !clarifyAnswer) {
      promptAppend = [promptAppend, buildClarifyingPromptRule(clarifyingAsk)].filter(Boolean).join('\n\n')
    }
    learningMeta.clarifying_ask = clarifyingAsk.ask && !clarifyAnswer ? clarifyingAsk.reason : null
    learningMeta.clarifying_question = clarifyingAsk.ask && !clarifyAnswer ? clarifyingAsk.question : null

    const adviceOutcomes = extractAdviceOutcomes(learningBundle.signals)
    const outcomesBlock = buildAdviceOutcomesPromptBlock(adviceOutcomes)
    if (outcomesBlock) {
      promptAppend = [promptAppend, outcomesBlock].filter(Boolean).join('\n\n')
    }
    learningMeta.advice_outcomes = adviceOutcomes.length

    const pastSelf = buildPastSelfComparison(scopedSnapshot, { outcomes: adviceOutcomes })
    if (pastSelf?.promptBlock) {
      promptAppend = [promptAppend, pastSelf.promptBlock].filter(Boolean).join('\n\n')
    }

    const coachQualityBrief = body?.coach_quality_brief ?? null
    if (voiceSource) {
      promptAppend = [
        promptAppend,
        'КАНАЛ: голосовой ввод. Правки владельца из этой реплики («короче», «запомни…») — столь же обязательны, как из текста.',
      ]
        .filter(Boolean)
        .join('\n\n')
    }

    const availabilityForCeiling = buildIskraDataAvailability(scopedSnapshot, {
      hasPreviousPeriod: !!previousSnapshot,
    })
    const ceiling = estimateIskraModelCeiling(
      availabilityForCeiling,
      buildForecastConfidenceLine(scopedSnapshot),
    )
    if (jarvisMode && ceiling.band !== 'high') {
      promptAppend = [promptAppend, buildModelCeilingPromptRule(ceiling)].filter(Boolean).join('\n\n')
    }
    learningMeta.model_ceiling = ceiling.score
    learningMeta.model_ceiling_band = ceiling.band

    const trainersList = scopedSnapshot?.trainer_contour?.trainers ?? []
    const effectiveTrainerId =
      panelSegment === 'trainer'
        ? selectedTrainerId ||
          (isTrainerFocusedQuestion(userMessage)
            ? resolveTrainerIdFromMessage(userMessage, trainersList)
            : null)
        : null

    let chipId =
      body?.force_gemini === true
        ? null
        : resolveInstantHandlerId({
            userMessage,
            comparePrevious,
            quickChips: quickChipsStored,
            handlerId: explicitHandlerId,
          })

    if (!chipId && !body?.force_gemini) {
      const adviceIntent = matchIskraAdviceIntent(userMessage)
      if (adviceIntent) chipId = adviceIntent
    }

    if (!chipId && !body?.force_gemini && advisorCtx.advisorRoleId !== 'app_admin') {
      const appTopic = matchIskraAppGuideIntent(userMessage)
      if (appTopic === 'sync') chipId = 'app_sync'
      else if (appTopic === 'structure' || appTopic === 'deploy') chipId = 'app_structure'
      else if (appTopic) chipId = 'app_guide'
    }

    if (!chipId && panelSegment === 'trainer' && isTrainerFocusedQuestion(userMessage)) {
      chipId = 'trainer_summary'
    }

    const introKind =
      body?.force_gemini === true || isTrainerFocusedQuestion(userMessage)
        ? null
        : matchGeminiIntroIntent(userMessage)

    if (introKind && !chipId) {
      const introText = buildGeminiIntroReply(introKind, {
        snapshot: scopedSnapshot,
        previousSnapshot,
        gender,
        clubName,
        periodLabel: scopedSnapshot?.period?.label,
      })
      if (introText) {
        setCachedGeminiResponse(
          clubId,
          ym.year,
          ym.month,
          gender,
          comparePrevious,
          userMessage,
          introText,
        )
        const persona = buildPersona(gender)
        sendJson(res, 200, attachSourceFacts({
          text: introText,
          persona: persona.name,
          club_name: clubName,
          year: ym.year,
          month: ym.month,
          source: 'instant',
          compare_previous: comparePrevious,
          intro_kind: introKind,
          ...advisorMeta,
          ...learningMeta,
        }, scopedSnapshot, userMessage, { handlerId: explicitHandlerId, chipId: introKind }))
        return
      }
    }

    if (chipId && shouldRouteChipToGemini(chipId, advisorCtx.advisorRoleId)) {
      chipId = null
    }

    if (chipId) {
      const focusedSnapshot = effectiveTrainerId
        ? applyTrainerFocusToSnapshot(scopedSnapshot, effectiveTrainerId)
        : scopedSnapshot
      const instantText = buildGeminiInstantReply(chipId, {
        snapshot: focusedSnapshot,
        previousSnapshot,
        gender,
        advisorRoleId: advisorCtx.advisorRoleId,
        userMessage,
      })
      if (instantText) {
        setCachedGeminiResponse(
          clubId,
          ym.year,
          ym.month,
          gender,
          comparePrevious,
          userMessage,
          instantText,
        )
        const persona = buildPersona(gender)
        sendJson(res, 200, attachSourceFacts({
          text: instantText,
          persona: persona.name,
          club_name: clubName,
          year: ym.year,
          month: ym.month,
          source: 'instant',
          compare_previous: comparePrevious,
          chip_id: chipId,
          ...advisorMeta,
          ...learningMeta,
        }, focusedSnapshot, userMessage, { chipId, handlerId: chipId }))
        return
      }
    }

    const messages = trimChatHistory(body?.messages, 6)
    const responseMode = resolveIskraResponseMode({
      advisorRoleId: advisorCtx.advisorRoleId,
      userMessage,
      explicitMode: responseModePref,
      userPreference: responseModePref,
      comparePrevious,
    })
    const geminiAdvisorCtx = buildIskraAdvisorContext({
      appRole,
      snapshot,
      adviceLimit: resolveAdviceCardLimit(responseMode),
    })
    const geminiScopedSnapshot = geminiAdvisorCtx.snapshot ?? snapshot

    const geminiPayload = buildGeminiGeneratePayload({
      gender,
      clubName,
      messages,
      userMessage,
      snapshot: geminiScopedSnapshot,
      previousSnapshot,
      selectedTrainerId: effectiveTrainerId,
      panelSegment,
      promptAppend,
      advisorRoleId: geminiAdvisorCtx.advisorRoleId,
      advisorRole: geminiAdvisorCtx.role,
      advisorAdvice: geminiAdvisorCtx.adviceSummary,
      responseMode,
      comparePrevious,
      dispatchOpen,
      learningBundle,
      coachQualityBrief,
    })

    const authHeader = String(req.headers.authorization || req.headers.Authorization || '')
    const keepClubOnOffTopic = shouldKeepClubContextOnOffTopic({
      advisorRoleId: geminiAdvisorCtx.advisorRoleId,
      responseMode,
    })
    const dataBlock =
      offTopicQuestion && !keepClubOnOffTopic
        ? { context: 'general_knowledge_question', club_name_for_role_reminder: clubName || 'филиала' }
        : buildGeminiPromptDataBlock(geminiScopedSnapshot, previousSnapshot, {
            selectedTrainerId: effectiveTrainerId,
            panelSegment,
            advisorRoleId: geminiAdvisorCtx.advisorRoleId,
            advisorAdvice: geminiAdvisorCtx.adviceSummary,
            responseMode,
            dispatchOpen,
            learningBundle,
            coachQualityBrief,
          })
    const edgeBody = {
      gender,
      club_name: clubName,
      user_message: userMessage,
      messages,
      prompt_data_block: dataBlock,
      compare_previous: comparePrevious,
      system_prompt: geminiPayload.systemInstruction.parts[0].text,
    }

    const apiKey = process.env.GEMINI_API_KEY || ''
    let { text, source } = await callGeminiForReply(authHeader, geminiPayload, edgeBody, apiKey, {
      skipEdge: (offTopicQuestion && !keepClubOnOffTopic) || shouldSkipGeminiEdge(responseMode),
    })

    if (offTopicQuestion && text) {
      text = normalizeIskraOffTopicReply(text, clubName, userMessage, {
        jarvis: keepClubOnOffTopic,
      })
    }

    if (isGeminiReplyIncomplete(text, undefined, responseMode)) {
      sendJson(res, 200, attachSourceFacts({
        text,
        persona: buildPersona(gender).name,
        club_name: clubName,
        year: ym.year,
        month: ym.month,
        source,
        compare_previous: comparePrevious,
        incomplete: true,
        response_mode: responseMode,
        ...advisorMeta,
        ...learningMeta,
      }, geminiScopedSnapshot, userMessage, { chipId, handlerId: explicitHandlerId }))
      return
    }

    if (!offTopicQuestion) {
      setCachedGeminiResponse(
        clubId,
        ym.year,
        ym.month,
        gender,
        comparePrevious,
        userMessage,
        text,
        responseMode,
      )
    }

    sendJson(res, 200, attachSourceFacts({
      text,
      persona: buildPersona(gender).name,
      club_name: clubName,
      year: ym.year,
      month: ym.month,
      source,
      compare_previous: comparePrevious,
      response_mode: responseMode,
      ...advisorMeta,
      ...learningMeta,
    }, geminiScopedSnapshot, userMessage, { chipId, handlerId: explicitHandlerId }))
  } catch (e) {
    const msg = formatGeminiUserError(e?.message ?? 'Ошибка аналитики')
    sendJson(res, 400, { error: msg })
  }
}
