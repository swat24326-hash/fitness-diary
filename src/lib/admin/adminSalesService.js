import { getAccessTokenForAdminApi } from './adminApiClient.js'
import {
  fetchClubSalesBundleViaSupabase,
  saveClubSalesDailyViaSupabase,
  saveClubSalesFinanceViaSupabase,
  saveClubSalesPlanViaSupabase,
} from './adminSalesLocalService.js'
import { isCloudReachable, fetchWithAppTimeout } from '../networkReachability.js'
import { humanizeNetworkError } from '../supabaseRetry.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJsonResponse(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 200) }
  }
}

function apiRouteMissing(res, contentType) {
  return res.status === 404 || (res.status === 200 && !contentType.includes('application/json'))
}

function mapApiSalesBundle(data, clubId, reportDate) {
  return {
    clubId: data.club_id ?? clubId,
    year: data.year,
    month: data.month,
    reportDate: data.report_date ?? reportDate,
    daily: data.daily ?? null,
    monthDays: Array.isArray(data.month_days) ? data.month_days : [],
    plan: data.plan ?? null,
    expense: data.expense ?? null,
    monthSummary: data.month_summary ?? null,
    membershipTypes: Array.isArray(data.membership_types) ? data.membership_types : [],
    trainers: Array.isArray(data.trainers) ? data.trainers : [],
    fitCityTypeStats: data.fit_city_type_stats ?? null,
    source: 'admin_api',
  }
}

function isApiTransportError(err) {
  const msg = String(err?.message ?? err ?? '')
  return /failed to fetch|connection reset|connection refused|timeout|таймаут|err_connection|load failed|сеть/i.test(
    msg,
  )
}

async function adminApiGet(path, token) {
  let res
  try {
    res = await fetchWithAppTimeout(`${apiOrigin()}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (e) {
    throw new Error(e?.message ?? 'Сеть')
  }
  const contentType = res.headers.get('content-type') || ''
  const data = await parseJsonResponse(res)
  if (res.ok) return { data, routeMissing: false }
  if (apiRouteMissing(res, contentType)) return { data: null, routeMissing: true }
  throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
}

async function adminApiPost(path, token, body) {
  let res
  try {
    res = await fetchWithAppTimeout(`${apiOrigin()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body ?? {}),
    })
  } catch (e) {
    throw new Error(e?.message ?? 'Сеть')
  }
  const contentType = res.headers.get('content-type') || ''
  const data = await parseJsonResponse(res)
  if (res.ok) return { data, routeMissing: false }
  if (apiRouteMissing(res, contentType)) return { data: null, routeMissing: true }
  throw new Error(data?.error ? String(data.error) : `Ошибка сервера (${res.status})`)
}

/** GET /api/admin-data?action=sales — Supabase first, API если облако Supabase недоступно */
export async function fetchClubSalesBundle({ clubId, reportDate }) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')

  const params = new URLSearchParams({
    action: 'sales',
    club_id: clubId,
    report_date: reportDate,
  })

  const loadViaApi = async () => {
    const { data, routeMissing } = await adminApiGet(`/api/admin-data?${params}`, token)
    if (routeMissing) throw new Error('API продаж недоступен — обновите деплой')
    return mapApiSalesBundle(data, clubId, reportDate)
  }

  let supabaseErr = null
  try {
    return await fetchClubSalesBundleViaSupabase({ clubId, reportDate })
  } catch (e) {
    supabaseErr = e
  }

  if (isCloudReachable()) {
    try {
      return await loadViaApi()
    } catch (apiErr) {
      const directMsg = humanizeNetworkError(supabaseErr) || String(supabaseErr?.message ?? '')
      const apiMsg = humanizeNetworkError(apiErr) || String(apiErr?.message ?? '')
      throw new Error(
        [directMsg && `Supabase: ${directMsg}`, apiMsg && `API: ${apiMsg}`].filter(Boolean).join(' ') ||
          'Не удалось загрузить отчёт продаж',
      )
    }
  }

  throw new Error(
    humanizeNetworkError(supabaseErr) || String(supabaseErr?.message ?? 'Не удалось загрузить отчёт продаж'),
  )
}

/** POST /api/admin-data?action=sales-daily */
export async function saveClubSalesDaily({
  clubId,
  reportDate,
  form,
  trainingsMatrixInput,
  trainerIds,
  membershipTypes,
}) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')

  const body = {
    club_id: clubId,
    report_date: reportDate,
    form,
    trainings_matrix_input: trainingsMatrixInput,
    trainer_ids: trainerIds,
    membership_types: membershipTypes,
  }

  try {
    if (isCloudReachable()) {
      const { data, routeMissing } = await adminApiPost('/api/admin-data?action=sales-daily', token, body)
      if (!routeMissing && data?.daily) return data.daily
    }
  } catch (e) {
    if (!isApiTransportError(e)) throw e
  }

  return saveClubSalesDailyViaSupabase({
    clubId,
    reportDate,
    form,
    trainingsMatrixInput,
    trainerIds,
    membershipTypes,
  })
}

/** POST /api/admin-data?action=sales-plan */
export async function saveClubSalesPlan({ clubId, year, month, form, scope }) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')

  try {
    if (isCloudReachable()) {
      const { data, routeMissing } = await adminApiPost('/api/admin-data?action=sales-plan', token, {
        club_id: clubId,
        year,
        month,
        form,
        scope,
      })
      if (!routeMissing && data?.plan) return data.plan
    }
  } catch (e) {
    if (!isApiTransportError(e)) throw e
  }

  return saveClubSalesPlanViaSupabase({ clubId, year, month, form, scope })
}

/** POST /api/admin-data?action=sales-finance */
export async function saveClubSalesFinance({ clubId, year, month, form }) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии — войдите снова')

  try {
    if (isCloudReachable()) {
      const { data, routeMissing } = await adminApiPost('/api/admin-data?action=sales-finance', token, {
        club_id: clubId,
        year,
        month,
        form,
      })
      if (!routeMissing && data?.expense) return data.expense
    }
  } catch (e) {
    if (!isApiTransportError(e)) throw e
  }

  return saveClubSalesFinanceViaSupabase({ clubId, year, month, form })
}
