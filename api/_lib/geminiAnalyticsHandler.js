import { readEnv, sendJson } from './adminSupabase.js'
import { loadGeminiAnalyticsContext } from './geminiAnalyticsData.js'
import {
  buildGeminiGeneratePayload,
  callGeminiGenerateContent,
} from './geminiApiClient.js'
import { buildPersona } from '../../src/lib/admin/geminiAnalyticsPrompt.js'
import { trimChatHistory } from '../../src/lib/admin/geminiAnalyticsSnapshot.js'

const rateLimitMs = 8000
const lastByUser = new Map()

function parseYearMonth(body) {
  const year = Math.trunc(Number(body?.year))
  const month = Math.trunc(Number(body?.month))
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null
  if (!Number.isFinite(month) || month < 1 || month > 12) return null
  return { year, month }
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
    if (res.ok && data?.text) return data
    return null
  } catch {
    return null
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
  const comparePrevious = body?.compare_previous === true
  const includeFinance = body?.include_finance !== false

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
  const last = lastByUser.get(userId) || 0
  if (now - last < rateLimitMs) {
    sendJson(res, 429, { error: 'Подождите несколько секунд перед следующим вопросом' })
    return
  }
  lastByUser.set(userId, now)

  try {
    const { snapshot, previousSnapshot, clubName } = await loadGeminiAnalyticsContext(
      ctx.supabaseAdmin,
      clubId,
      ym.year,
      ym.month,
      { comparePrevious, includeFinance },
    )

    const messages = trimChatHistory(body?.messages, 10)
    const geminiPayload = buildGeminiGeneratePayload({
      gender,
      clubName,
      messages,
      userMessage,
      snapshot,
      previousSnapshot,
    })

    const authHeader = String(req.headers.authorization || req.headers.Authorization || '')
    const edgeBody = {
      gender,
      club_name: clubName,
      user_message: userMessage,
      messages,
      snapshot,
      previous_snapshot: previousSnapshot,
      compare_previous: comparePrevious,
    }

    let text = ''
    let source = 'vercel'

    const edgeResult = await tryEdgeGemini(authHeader, edgeBody)
    if (edgeResult?.text) {
      text = String(edgeResult.text)
      source = 'edge'
    } else {
      const apiKey = process.env.GEMINI_API_KEY || ''
      const gemini = await callGeminiGenerateContent(apiKey, geminiPayload)
      text = gemini.text
    }

    const persona = buildPersona(gender)
    sendJson(res, 200, {
      text,
      persona: persona.name,
      club_name: clubName,
      year: ym.year,
      month: ym.month,
      source,
    })
  } catch (e) {
    const msg = e?.message ? String(e.message) : 'Ошибка аналитики'
    sendJson(res, 400, { error: msg })
  }
}
