/**
 * Клиентский контекст ЗП: live (текущий месяц) или API-снимок (прошлый).
 */
import { calendarMonthRelation } from './clubFinanceForecastCore.js'
import { normalizeTrainerPayPlanConfig } from './trainerPayPlanCore.js'
import { indexTrainerPayProfilesByTrainerId } from './trainerPayProfileCore.js'
import { fetchTrainerPayPlanSettings } from './trainerPayPlanSettingsService.js'
import { fetchTrainerPayProfiles } from './trainerPayProfileSettingsService.js'
import { getAccessTokenForAdminApi } from './adminApiClient.js'

const apiOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

async function parseJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 300) }
  }
}

/**
 * @param {string} clubId
 * @param {{ year: number, month: number }} ym
 */
async function fetchFrozenPayrollContext(clubId, ym) {
  const token = await getAccessTokenForAdminApi()
  if (!token) throw new Error('Нет сессии')
  const params = new URLSearchParams({
    action: 'trainer-pay-payroll-context',
    club_id: clubId,
    year: String(ym.year),
    month: String(ym.month),
  })
  const res = await fetch(`${apiOrigin()}/api/admin-data?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`)
  return data
}

/**
 * @param {string} clubId
 * @param {{ year?: number, month?: number, today?: Date }} [opts]
 */
export async function loadTrainerPayrollContextClient(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return {
      planConfig: normalizeTrainerPayPlanConfig(null),
      profilesByTrainerId: new Map(),
      membershipTypes: null,
      clubId: '',
      frozen: false,
    }
  }

  const year = Number(opts.year)
  const month = Number(opts.month)
  const today = opts.today ?? new Date()
  const hasYm = Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12
  const past = hasYm && calendarMonthRelation(year, month, today) === -1

  if (past) {
    try {
      const data = await fetchFrozenPayrollContext(cid, { year, month })
      return {
        planConfig: normalizeTrainerPayPlanConfig(data?.planConfig),
        profilesByTrainerId: indexTrainerPayProfilesByTrainerId(data?.profiles ?? []),
        membershipTypes: Array.isArray(data?.membershipTypes) ? data.membershipTypes : [],
        clubId: cid,
        frozen: Boolean(data?.frozen),
        frozen_at: data?.frozen_at ?? null,
        migration_needed: Boolean(data?.migration_needed),
        year,
        month,
      }
    } catch {
      /* API/миграция — fallback live */
    }
  }

  const [planRes, profilesRes] = await Promise.all([
    fetchTrainerPayPlanSettings(cid).catch(() => null),
    fetchTrainerPayProfiles(cid).catch(() => null),
  ])
  return {
    planConfig: normalizeTrainerPayPlanConfig(planRes?.config),
    profilesByTrainerId: indexTrainerPayProfilesByTrainerId(profilesRes?.profiles ?? []),
    membershipTypes: null,
    clubId: cid,
    frozen: false,
  }
}
