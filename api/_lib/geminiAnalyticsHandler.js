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
import {
  buildGeminiIntroReply,
  matchGeminiIntroIntent,
} from '../../src/lib/admin/geminiAssistantIntro.js'
import { periodLabelRu, trimChatHistory } from '../../src/lib/admin/geminiAnalyticsSnapshot.js'
import { buildPanelKpiFromAnalytics } from '../../src/lib/admin/clubMonthAnalyticsCore.js'

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

async function callGeminiForReply(authHeader, geminiPayload, edgeBody, apiKey) {
  let text = ''
  let source = 'vercel'

  const edgeResult = await tryEdgeGemini(authHeader, edgeBody)
  if (edgeResult?.ok && edgeResult.data?.text) {
    const edgeText = String(edgeResult.data.text)
    if (!isGeminiReplyIncomplete(edgeText)) {
      text = edgeText
      source = 'edge'
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
    try {
      const settings = await loadClubIskraSettings(ctx.supabaseAdmin, parsed.clubId)
      quickChips = settings.quick_chips
    } catch {
      quickChips = null
    }
    sendJson(res, 200, {
      ok: true,
      warmed: true,
      club_id: parsed.clubId,
      year: parsed.year,
      month: parsed.month,
      period: snapshot.period?.label ?? periodLabelRu(parsed.year, parsed.month),
      kpi: buildPanelKpiFromAnalytics(snapshot),
      trainers: (snapshot.trainer_contour?.trainers ?? []).map((t) => ({
        trainer_id: t.trainer_id,
        trainer_name: t.trainer_name,
      })),
      quick_chips: quickChips,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка prefetch' })
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
  const skipCache = body?.skip_cache === true || body?.force_gemini === true
  const completionRetry = body?.completion_retry === true

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
    if (!skipCache) {
      const cached = getCachedGeminiResponse(
        clubId,
        ym.year,
        ym.month,
        gender,
        comparePrevious,
        userMessage,
      )
      if (cached) {
        const persona = buildPersona(gender)
        const snap = getCachedGeminiSnapshot(clubId, ym.year, ym.month, includeFinance)
        sendJson(res, 200, {
          text: cached,
          persona: persona.name,
          club_name: snap?.club_name ?? '',
          year: ym.year,
          month: ym.month,
          source: 'cache',
          compare_previous: comparePrevious,
          cached: true,
        })
        return
      }
    }

    const { snapshot, previousSnapshot, clubName } = await loadGeminiAnalyticsContext(
      ctx.supabaseAdmin,
      clubId,
      ym.year,
      ym.month,
      { comparePrevious, includeFinance },
    )

    let promptAppend = ''
    let quickChipsStored = null
    try {
      const settings = await loadClubIskraSettings(ctx.supabaseAdmin, clubId)
      promptAppend = settings.prompt_append
      quickChipsStored = settings.quick_chips
    } catch {
      promptAppend = ''
      quickChipsStored = null
    }

    const explicitHandlerId = String(body?.handler_id ?? '').trim() || null
    const chipId =
      body?.force_gemini === true
        ? null
        : resolveInstantHandlerId({
            userMessage,
            comparePrevious,
            quickChips: quickChipsStored,
            handlerId: explicitHandlerId,
          })
    const introKind = body?.force_gemini === true ? null : matchGeminiIntroIntent(userMessage)

    if (introKind && !chipId) {
      const introText = buildGeminiIntroReply(introKind, {
        snapshot,
        previousSnapshot,
        gender,
        clubName,
        periodLabel: snapshot?.period?.label,
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
        sendJson(res, 200, {
          text: introText,
          persona: persona.name,
          club_name: clubName,
          year: ym.year,
          month: ym.month,
          source: 'instant',
          compare_previous: comparePrevious,
          intro_kind: introKind,
        })
        return
      }
    }

    if (chipId) {
      const instantText = buildGeminiInstantReply(chipId, {
        snapshot,
        previousSnapshot,
        gender,
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
        sendJson(res, 200, {
          text: instantText,
          persona: persona.name,
          club_name: clubName,
          year: ym.year,
          month: ym.month,
          source: 'instant',
          compare_previous: comparePrevious,
          chip_id: chipId,
        })
        return
      }
    }

    const messages = trimChatHistory(body?.messages, 6)
    const geminiPayload = buildGeminiGeneratePayload({
      gender,
      clubName,
      messages,
      userMessage,
      snapshot,
      previousSnapshot,
      selectedTrainerId,
      promptAppend,
    })

    const authHeader = String(req.headers.authorization || req.headers.Authorization || '')
    const dataBlock = buildGeminiPromptDataBlock(snapshot, previousSnapshot, { selectedTrainerId })
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
    const { text, source } = await callGeminiForReply(authHeader, geminiPayload, edgeBody, apiKey)

    if (isGeminiReplyIncomplete(text)) {
      sendJson(res, 200, {
        text,
        persona: buildPersona(gender).name,
        club_name: clubName,
        year: ym.year,
        month: ym.month,
        source,
        compare_previous: comparePrevious,
        incomplete: true,
      })
      return
    }

    setCachedGeminiResponse(clubId, ym.year, ym.month, gender, comparePrevious, userMessage, text)

    const persona = buildPersona(gender)
    sendJson(res, 200, {
      text,
      persona: persona.name,
      club_name: clubName,
      year: ym.year,
      month: ym.month,
      source,
      compare_previous: comparePrevious,
    })
  } catch (e) {
    const msg = formatGeminiUserError(e?.message ?? 'Ошибка аналитики')
    sendJson(res, 400, { error: msg })
  }
}
