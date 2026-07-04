import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { formatGeminiUserError } from './geminiAnalyticsPrompt.js'
import { fetchWithAppTimeout } from '../networkReachability.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

export const GEMINI_REQUEST_TIMEOUT_MS = 28_000

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 300) }
  }
}

export class GeminiAnalyticsError extends Error {
  /** @param {string} message @param {{ retryAfterSec?: number, incomplete?: boolean }} [meta] */
  constructor(message, meta = {}) {
    super(message)
    this.name = 'GeminiAnalyticsError'
    this.retryAfterSec = Number(meta.retryAfterSec) || 0
    this.incomplete = meta.incomplete === true
  }
}

/**
 * @param {{ clubId: string, year: number, month: number }} opts
 */
export async function prefetchGeminiSnapshot(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) return null

  const params = new URLSearchParams({
    action: 'gemini-analytics-prefetch',
    club_id: opts.clubId,
    year: String(opts.year),
    month: String(opts.month),
  })

  try {
    const res = await fetchWithAppTimeout(
      `${apiOrigin()}/api/admin-data?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
        cache: 'no-store',
      },
      GEMINI_REQUEST_TIMEOUT_MS,
    )
    if (!res.ok) return null
    return parseJsonResponse(res)
  } catch {
    return null
  }
}

/**
 * @param {{
 *   clubId: string,
 *   year: number,
 *   month: number,
 *   gender: 'male' | 'female',
 *   userMessage: string,
 *   messages?: Array<{ role: string, content: string }>,
 *   comparePrevious?: boolean,
 *   skipCache?: boolean,
 *   forceGemini?: boolean,
 *   completionRetry?: boolean,
 * }} opts
 */
export async function postGeminiAnalytics(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new GeminiAnalyticsError('Нет сессии администратора')

  const res = await fetchWithAppTimeout(
    `${apiOrigin()}/api/admin-data?action=gemini-analytics`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({
        club_id: opts.clubId,
        year: opts.year,
        month: opts.month,
        gender: opts.gender === 'female' ? 'female' : 'male',
        user_message: opts.userMessage,
        messages: opts.messages ?? [],
        compare_previous: opts.comparePrevious === true,
        skip_cache: opts.skipCache === true,
        force_gemini: opts.forceGemini === true,
        completion_retry: opts.completionRetry === true,
      }),
    },
    GEMINI_REQUEST_TIMEOUT_MS,
  )

  const data = await parseJsonResponse(res)
  if (!res.ok) {
    const retryAfterSec = Number(data?.retry_after_sec) || (res.status === 429 ? 12 : 0)
    throw new GeminiAnalyticsError(formatGeminiUserError(data?.error ?? `Ошибка сервера (${res.status})`), {
      retryAfterSec,
      incomplete: data?.incomplete === true,
    })
  }
  return data
}
