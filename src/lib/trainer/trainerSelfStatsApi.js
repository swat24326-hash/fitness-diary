/**
 * GET /api/admin-data?action=trainer-self-stats — ЗП и сводка периода с сервера.
 * Параллельные вызовы с тем же периодом схлопываются (ЗП + статистика на одном экране).
 */

import { getAccessTokenForAdminApi, apiRouteMissing } from '../admin/adminApiClient.js'
import { fetchWithAppTimeout, CLUB_STATS_FETCH_TIMEOUT_MS } from '../networkReachability.js'
import { sleep } from '../supabaseRetry.js'

function apiOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

/** @type {Map<string, Promise<object>>} */
const inflight = new Map()

/**
 * @param {{ dateFrom: string, dateTo: string, dayIso: string, clubId?: string | null }} p
 * @returns {Promise<object>}
 */
export async function fetchTrainerSelfStatsViaApi(p) {
  const dateFrom = String(p.dateFrom ?? '').slice(0, 10)
  const dateTo = String(p.dateTo ?? '').slice(0, 10)
  const dayIso = String(p.dayIso ?? dateTo).slice(0, 10)
  if (!dateFrom || !dateTo || !dayIso) {
    throw new Error('Не задан период для статистики')
  }

  const clubId = String(p.clubId ?? '').trim()
  const key = `${dateFrom}|${dateTo}|${dayIso}|${clubId}`
  const existing = inflight.get(key)
  if (existing) return existing

  const task = (async () => {
    let lastErr = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fetchTrainerSelfStatsOnce({ dateFrom, dateTo, dayIso, clubId })
      } catch (e) {
        lastErr = e
        const msg = String(e?.message ?? e ?? '')
        const retryable = /timeout|таймаут|сеть|503|502|504|failed to fetch|aborted/i.test(msg)
        if (!retryable || attempt === 2) throw e
        await sleep(700 * (attempt + 1))
      }
    }
    throw lastErr ?? new Error('Не удалось загрузить статистику')
  })()

  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

async function fetchTrainerSelfStatsOnce({ dateFrom, dateTo, dayIso, clubId }) {
  let token = await getAccessTokenForAdminApi()
  if (!token) {
    await sleep(400)
    token = await getAccessTokenForAdminApi()
  }
  if (!token) {
    throw new Error('Нет сессии — выйдите и войдите снова на планшете')
  }

  const params = new URLSearchParams({
    action: 'trainer-self-stats',
    date_from: dateFrom,
    date_to: dateTo,
    day: dayIso,
  })
  if (clubId) params.set('club_id', clubId)

  const res = await fetchWithAppTimeout(
    `${apiOrigin()}/api/admin-data?${params}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    },
    CLUB_STATS_FETCH_TIMEOUT_MS,
  )

  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  if (apiRouteMissing(res, contentType)) {
    throw new Error('Сервер без action trainer-self-stats — нужен деплой')
  }
  if (!res.ok) {
    throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
  }
  if (!data?.period || typeof data.period.totalCompleted !== 'number') {
    throw new Error('Пустой ответ статистики с сервера')
  }
  return data
}
