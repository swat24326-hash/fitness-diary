import { getAccessTokenForAdminApi } from './adminApiClient.js'
import { formatGeminiUserError } from './geminiAnalyticsPrompt.js'
import { fetchWithAppTimeout, probeCloudNow } from '../networkReachability.js'
import { sleep } from '../supabaseRetry.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

export const GEMINI_REQUEST_TIMEOUT_MS = 45_000
export const GEMINI_PREFETCH_ATTEMPTS = 3

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
 * @param {{ attempts?: number, probeCloud?: boolean }} [retryOpts]
 * @returns {Promise<{ ok: boolean, kpi?: object | null, trainers?: object[], quickChips?: unknown, error?: string }>}
 */
export async function prefetchGeminiSnapshot(opts, retryOpts = {}) {
  const attempts = Math.max(1, Number(retryOpts.attempts) || GEMINI_PREFETCH_ATTEMPTS)
  const probeCloud = retryOpts.probeCloud !== false
  let lastError = 'Не удалось загрузить данные'

  if (probeCloud) {
    try {
      await probeCloudNow()
    } catch {
      /* ignore */
    }
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = await getAccessTokenForAdminApi()
    if (!token) {
      return { ok: false, error: 'Сессия истекла — войдите снова или обновите страницу (Ctrl+F5)' }
    }

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
      const data = await parseJsonResponse(res)
      if (res.ok && data?.kpi) {
        return {
          ok: true,
          kpi: data.kpi,
          trainers: Array.isArray(data.trainers) ? data.trainers : [],
          quickChips: data.quick_chips ?? null,
        }
      }
      lastError =
        formatGeminiUserError(data?.error) ||
        (res.status === 401
          ? 'Сессия истекла — войдите снова'
          : res.status === 504 || res.status === 408
            ? 'Сервер долго собирает данные — повторите через несколько секунд'
            : `Ошибка загрузки (${res.status})`)
    } catch (e) {
      lastError = e?.message ? String(e.message) : 'Таймаут связи с сервером'
    }

    if (attempt < attempts - 1) {
      await sleep(1500 * (attempt + 1))
      if (probeCloud) {
        try {
          await probeCloudNow()
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { ok: false, error: lastError }
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
 *   completionRetry?: boolean,
 *   selectedTrainerId?: string | null,
 *   selectedTrainerId?: string | null,
 *   handlerId?: string | null,
 *   appRole?: string,
 * }} opts
 */
export async function postGeminiAnalytics(opts) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new GeminiAnalyticsError('Нет сессии администратора — войдите снова')

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
        selected_trainer_id: opts.selectedTrainerId ? String(opts.selectedTrainerId).trim() : undefined,
        handler_id: opts.handlerId ? String(opts.handlerId).trim() : undefined,
        app_role: opts.appRole ? String(opts.appRole).trim() : undefined,
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
