/**
 * Загрузка дрейфа стратегии: архив клуба vs снимок кандидатов ДК.
 */

import { fetchClientsForClubViaAdminApi, fetchMembershipsForClubViaAdminApi } from './adminApiClient.js'
import { clampRenewalPct } from './salesPlanHallRenewalsSuggestCore.js'
import {
  findArchivedEndingBackgroundRisk,
  findArchivedRenewalDrift,
} from './salesStrategyArchiveDriftCore.js'

/**
 * @param {{
 *   clubId: string,
 *   previousCandidates?: object[],
 *   renewalPct?: unknown,
 *   year?: number,
 *   month?: number,
 * }} opts
 */
export async function loadStrategyArchiveDrift(opts) {
  const clubId = String(opts?.clubId ?? '').trim()
  if (!clubId) return { ok: false, error: 'Не выбран клуб' }

  const renewalPct = clampRenewalPct(opts?.renewalPct)
  const previousCandidates = Array.isArray(opts?.previousCandidates) ? opts.previousCandidates : []

  let archivedBundle
  try {
    archivedBundle = await fetchClientsForClubViaAdminApi(clubId, { mode: 'archive' })
  } catch (e) {
    return { ok: false, error: e?.message || 'Не удалось загрузить архив клиентов' }
  }
  if (archivedBundle == null) {
    return { ok: false, error: 'Нет доступа к списку клиентов (нужна сессия админа)' }
  }

  const archivedClients = archivedBundle.clients ?? []

  if (previousCandidates.length > 0) {
    const drift = findArchivedRenewalDrift({
      previousCandidates,
      clients: archivedClients,
      renewalPct,
    })
    if (drift.ok) {
      return {
        ...drift,
        ok: true,
        truncated: Boolean(archivedBundle.truncated),
      }
    }
  }

  // Фоновый info: архивные с окончанием абона в месяце плана
  const year = Number(opts?.year)
  const month = Number(opts?.month)
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return {
      ok: false,
      count: 0,
      lostDkRub: 0,
      suggestUkRub: 0,
      rows: [],
      tone: 'info',
      archiveExcludedFromRenewals: true,
      source: 'none',
    }
  }

  let memberships = []
  try {
    const memRes = await fetchMembershipsForClubViaAdminApi(clubId)
    memberships = memRes?.memberships ?? []
  } catch {
    memberships = []
  }

  const bg = findArchivedEndingBackgroundRisk({
    clients: archivedClients,
    memberships,
    year,
    month,
  })
  if (bg.ok) {
    return {
      ...bg,
      ok: true,
      truncated: Boolean(archivedBundle.truncated),
    }
  }

  return {
    ok: false,
    count: 0,
    lostDkRub: 0,
    suggestUkRub: 0,
    rows: [],
    tone: 'info',
    archiveExcludedFromRenewals: true,
    source: 'none',
    truncated: Boolean(archivedBundle.truncated),
  }
}
