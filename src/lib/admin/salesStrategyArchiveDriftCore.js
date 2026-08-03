/**
 * Дрейф стратегии: кандидаты ДК ушли в архив → потеря ДК, подсказка добрать УК.
 * Архив в продлениях не считается (см. isClientExcludedFromRenewals).
 */

import { clampRenewalPct } from './salesPlanPzDkSuggestCore.js'
import { roundPlanRub } from './salesPlanMatrixCore.js'
import { membershipEndsInPlanMonth } from './salesPlanHallRenewalsSuggestCore.js'

/**
 * @param {object|null|undefined} client
 */
export function isClientArchivedForDrift(client) {
  if (!client) return false
  if (client.archived_at) return true
  const life = String(client.lifecycle ?? '').trim().toLowerCase()
  return life === 'archived' || life === 'archive'
}

/**
 * Ориентир потерянного ДК по кандидату (чек × % продления).
 * @param {{ avgRub?: number }} candidate
 * @param {unknown} renewalPct
 */
export function candidateLostDkRub(candidate, renewalPct) {
  const pct = clampRenewalPct(renewalPct)
  const avg = Math.max(0, Number(candidate?.avgRub) || 0)
  return roundPlanRub((avg * pct) / 100)
}

/**
 * Сверка прошлого расчёта с текущим архивом.
 * @param {{
 *   previousCandidates?: Array<{
 *     clientId?: string,
 *     clientName?: string,
 *     hall?: string,
 *     endDate?: string,
 *     avgRub?: number,
 *   }>,
 *   clients?: object[],
 *   renewalPct?: unknown,
 * }} input
 */
export function findArchivedRenewalDrift(input) {
  const pct = clampRenewalPct(input?.renewalPct)
  /** @type {Map<string, object>} */
  const byId = new Map()
  for (const c of input?.clients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (id) byId.set(id, c)
  }

  /** @type {object[]} */
  const rows = []
  for (const cand of input?.previousCandidates ?? []) {
    const id = String(cand?.clientId ?? '').trim()
    if (!id) continue
    const client = byId.get(id)
    if (!client || !isClientArchivedForDrift(client)) continue
    const lostDkRub = candidateLostDkRub(cand, pct)
    const name = String(
      cand?.clientName || client?.full_name || client?.name || client?.fio || '',
    ).trim()
    rows.push({
      clientId: id,
      clientName: name || 'Без имени',
      hall: cand?.hall === 'tz' || cand?.hall === 'az' ? cand.hall : 'pz',
      endDate: String(cand?.endDate ?? '').slice(0, 10),
      avgRub: Math.max(0, Number(cand?.avgRub) || 0),
      lostDkRub,
    })
  }

  rows.sort((a, b) => {
    if (a.endDate && b.endDate && a.endDate !== b.endDate) {
      return a.endDate < b.endDate ? -1 : 1
    }
    return String(a.clientName).localeCompare(String(b.clientName), 'ru')
  })

  const lostDkRub = roundPlanRub(rows.reduce((a, r) => a + (Number(r.lostDkRub) || 0), 0))
  const count = rows.length
  return {
    ok: count > 0,
    tone: /** @type {'warn'} */ ('warn'),
    count,
    lostDkRub,
    suggestUkRub: lostDkRub,
    rows,
    archiveExcludedFromRenewals: true,
    source: 'previous_candidates',
  }
}

/**
 * Фоновый риск: в архиве есть клиенты с окончанием абона в месяце плана (без прошлого снимка).
 * @param {{
 *   clients?: object[],
 *   memberships?: object[],
 *   year?: number,
 *   month?: number,
 * }} input
 */
export function findArchivedEndingBackgroundRisk(input) {
  const year = Number(input?.year)
  const month = Number(input?.month)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return {
      ok: false,
      tone: /** @type {'info'} */ ('info'),
      count: 0,
      lostDkRub: 0,
      suggestUkRub: 0,
      rows: [],
      archiveExcludedFromRenewals: true,
      source: 'background',
    }
  }

  /** @type {Map<string, object[]>} */
  const memByClient = new Map()
  for (const m of input?.memberships ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid) continue
    if (!memByClient.has(cid)) memByClient.set(cid, [])
    memByClient.get(cid).push(m)
  }

  /** @type {object[]} */
  const rows = []
  for (const client of input?.clients ?? []) {
    if (!isClientArchivedForDrift(client)) continue
    const id = String(client?.id ?? '').trim()
    if (!id) continue
    const list = memByClient.get(id) ?? []
    const ending = list
      .filter((m) => membershipEndsInPlanMonth(m?.end_date, year, month))
      .sort((a, b) => {
        const ae = String(a?.end_date ?? '')
        const be = String(b?.end_date ?? '')
        return ae < be ? 1 : ae > be ? -1 : 0
      })
    if (!ending.length) continue
    const endDate = String(ending[0]?.end_date ?? '').slice(0, 10)
    const name = String(client?.full_name || client?.name || client?.fio || '').trim()
    const desk = String(client?.desk_hall ?? '')
      .trim()
      .toLowerCase()
    const hall = desk === 'tz' || desk === 'az' ? desk : client?.trainer_id ? 'pz' : 'pz'
    rows.push({
      clientId: id,
      clientName: name || 'Без имени',
      hall,
      endDate,
      avgRub: 0,
      lostDkRub: 0,
    })
  }

  rows.sort((a, b) => {
    if (a.endDate && b.endDate && a.endDate !== b.endDate) {
      return a.endDate < b.endDate ? -1 : 1
    }
    return String(a.clientName).localeCompare(String(b.clientName), 'ru')
  })

  const count = rows.length
  return {
    ok: count > 0,
    tone: /** @type {'info'} */ ('info'),
    count,
    lostDkRub: 0,
    suggestUkRub: 0,
    rows,
    archiveExcludedFromRenewals: true,
    source: 'background',
  }
}
