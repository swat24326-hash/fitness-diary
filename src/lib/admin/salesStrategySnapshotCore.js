/**
 * Снимок Стратегии (playbook) для club_sales_plan.strategy_snapshot.
 * Без React / IndexedDB.
 */

import { clampRenewalPct } from './salesPlanHallRenewalsSuggestCore.js'
import { roundPlanRub } from './salesPlanMatrixCore.js'

export const STRATEGY_SNAPSHOT_VERSION = 1
export const STRATEGY_SNAPSHOT_MAX_ROWS = 2000

/**
 * @param {unknown} row
 * @param {{ confirmed?: boolean }} [opts]
 */
function normalizeClosingRow(row, opts = {}) {
  if (!row || typeof row !== 'object') return null
  const clientId = String(row.clientId ?? row.client_id ?? '').trim()
  const endDate = String(row.endDate ?? row.end_date ?? '').slice(0, 10)
  if (!clientId || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null
  const hall = row.hall === 'tz' || row.hall === 'az' ? row.hall : 'pz'
  const avgRaw = row.avgRub ?? row.avg_rub
  const avgRub =
    avgRaw == null || avgRaw === ''
      ? null
      : roundPlanRub(Math.max(0, Number(avgRaw) || 0))
  const factRaw = row.factAmount ?? row.fact_amount
  const factAmount =
    factRaw == null || factRaw === ''
      ? null
      : roundPlanRub(Math.max(0, Number(factRaw) || 0)) || null
  /** @type {object} */
  const out = {
    clientId,
    clientName: String(row.clientName ?? row.client_name ?? '').trim(),
    phone: String(row.phone ?? '').trim(),
    cardNumber: String(row.cardNumber ?? row.card_number ?? '').trim(),
    hall,
    endDate,
    avgRub: avgRub != null && avgRub > 0 ? avgRub : avgRub === 0 ? 0 : null,
    sampleCount: Math.max(0, Math.trunc(Number(row.sampleCount) || 0)),
    source: row.source === 'price_list' || row.source === 'history' ? row.source : null,
  }
  if (opts.confirmed) {
    out.confirmed = true
    out.factAmount = factAmount
  }
  return out
}

/**
 * @param {unknown} pack
 */
function slimPack(pack) {
  if (!pack || typeof pack !== 'object' || !pack.ok) {
    return { ok: false }
  }
  /** @type {Record<string, { nk: number, uk: number, dk?: number, total?: number }>} */
  const byHall = {}
  for (const h of ['pz', 'tz', 'az']) {
    const row = pack.byHall?.[h]
    byHall[h] = {
      nk: roundPlanRub(Number(row?.nk) || 0),
      uk: roundPlanRub(Number(row?.uk) || 0),
      dk: roundPlanRub(Number(row?.dk) || 0),
      total: roundPlanRub(Number(row?.total) || 0),
    }
  }
  return {
    ok: true,
    totalAmount: roundPlanRub(Number(pack.totalAmount) || 0),
    totalWithExtra: roundPlanRub(Number(pack.totalWithExtra) || Number(pack.totalAmount) || 0),
    budget: roundPlanRub(Number(pack.budget) || 0),
    level3Budget: roundPlanRub(Number(pack.level3Budget) || Number(pack.budget) || 0),
    planExtraRub: roundPlanRub(Number(pack.planExtraRub) || 0),
    prevExtraRub: roundPlanRub(Number(pack.prevExtraRub) || 0),
    planExtraPct: Math.min(100, Math.max(0, Number(pack.planExtraPct) || 0)),
    budgetDelta: roundPlanRub(Number(pack.budgetDelta) || 0),
    budgetTolerance: roundPlanRub(Number(pack.budgetTolerance) || 0),
    fittedToBudget: pack.fittedToBudget !== false,
    byHall,
  }
}

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   renewalsSuggest?: object|null,
 *   topUpPack?: object|null,
 *   updatedAt?: string,
 * }} input
 */
export function buildStrategySnapshot(input) {
  const year = Number(input?.year)
  const month = Number(input?.month)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false, error: 'Некорректный месяц снимка' }
  }
  const suggest = input?.renewalsSuggest
  if (!suggest?.ok) {
    return { ok: false, error: 'Нет успешного расчёта для снимка' }
  }

  /** @type {object[]} */
  const candidates = []
  for (const c of suggest.candidates ?? []) {
    const row = normalizeClosingRow(c, { confirmed: false })
    if (row) candidates.push(row)
    if (candidates.length >= STRATEGY_SNAPSHOT_MAX_ROWS) break
  }

  /** @type {object[]} */
  const confirmedClosings = []
  for (const c of suggest.confirmedClosings ?? []) {
    const row = normalizeClosingRow(c, { confirmed: true })
    if (row) confirmedClosings.push(row)
    if (candidates.length + confirmedClosings.length >= STRATEGY_SNAPSHOT_MAX_ROWS) break
  }

  const updatedAt =
    String(input?.updatedAt ?? '').trim() || new Date().toISOString()

  return {
    ok: true,
    snapshot: {
      v: STRATEGY_SNAPSHOT_VERSION,
      updatedAt,
      year,
      month,
      renewalPct: clampRenewalPct(suggest.renewalPct),
      historyDepth: Math.max(0, Math.trunc(Number(suggest.historyDepth) || 0)),
      horizon: suggest.horizon === 'next' ? 'next' : 'current',
      candidates,
      confirmedClosings,
      pack: slimPack(input?.topUpPack),
      endingAlreadyPurchased: Math.max(
        0,
        Math.trunc(Number(suggest.endingAlreadyPurchased) || 0),
      ),
    },
  }
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, snapshot: object } | { ok: false, error: string }}
 */
export function parseStrategySnapshot(raw) {
  if (raw == null) return { ok: false, error: 'Нет снимка' }
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'Снимок повреждён' }
    }
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'Нет снимка' }

  const year = Number(data.year)
  const month = Number(data.month)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false, error: 'В снимке некорректный месяц' }
  }

  /** @type {object[]} */
  const candidates = []
  for (const c of Array.isArray(data.candidates) ? data.candidates : []) {
    const row = normalizeClosingRow(c, { confirmed: false })
    if (row) candidates.push(row)
    if (candidates.length >= STRATEGY_SNAPSHOT_MAX_ROWS) break
  }
  /** @type {object[]} */
  const confirmedClosings = []
  for (const c of Array.isArray(data.confirmedClosings) ? data.confirmedClosings : []) {
    const row = normalizeClosingRow(c, { confirmed: true })
    if (row) confirmedClosings.push(row)
    if (candidates.length + confirmedClosings.length >= STRATEGY_SNAPSHOT_MAX_ROWS) break
  }

  if (!candidates.length && !confirmedClosings.length) {
    return { ok: false, error: 'В снимке нет закрытий' }
  }

  const packRaw = data.pack && typeof data.pack === 'object' ? data.pack : { ok: false }
  const pack = slimPack({ ...packRaw, ok: packRaw.ok !== false })

  return {
    ok: true,
    snapshot: {
      v: STRATEGY_SNAPSHOT_VERSION,
      updatedAt: String(data.updatedAt ?? data.updated_at ?? '').trim(),
      year,
      month,
      renewalPct: clampRenewalPct(data.renewalPct),
      historyDepth: Math.max(0, Math.trunc(Number(data.historyDepth) || 0)),
      horizon: data.horizon === 'next' ? 'next' : 'current',
      candidates,
      confirmedClosings,
      pack,
      endingAlreadyPurchased: Math.max(
        0,
        Math.trunc(Number(data.endingAlreadyPurchased) || 0),
      ),
    },
  }
}

/**
 * Для API: принять body.strategy_snapshot → валидный jsonb или ошибка.
 * @param {unknown} raw
 */
export function validateStrategySnapshotForSave(raw) {
  const parsed = parseStrategySnapshot(raw)
  if (!parsed.ok) return parsed
  const json = JSON.stringify(parsed.snapshot)
  if (json.length > 1_500_000) {
    return { ok: false, error: 'Снимок Стратегии слишком большой' }
  }
  return { ok: true, snapshot: parsed.snapshot }
}

/**
 * Suggest + pack из снимка для гидрации UI / playbook.
 * @param {object} snapshot результат parseStrategySnapshot
 */
export function renewalsSuggestFromSnapshot(snapshot) {
  if (!snapshot) return null
  return {
    ok: true,
    year: snapshot.year,
    month: snapshot.month,
    renewalPct: snapshot.renewalPct,
    historyDepth: snapshot.historyDepth,
    horizon: snapshot.horizon,
    candidates: snapshot.candidates ?? [],
    confirmedClosings: snapshot.confirmedClosings ?? [],
    endingAlreadyPurchased: snapshot.endingAlreadyPurchased ?? 0,
    fromSnapshot: true,
    snapshotUpdatedAt: snapshot.updatedAt || '',
  }
}

/**
 * @param {object} snapshot
 */
export function topUpPackFromSnapshot(snapshot) {
  const pack = snapshot?.pack
  if (!pack?.ok) return null
  const budget = Number(pack.budget) || 0
  const totalAmount = Number(pack.totalAmount) || budget || 0
  if (!(totalAmount > 0)) return null
  return {
    ok: true,
    totalAmount,
    totalWithExtra: roundPlanRub(Number(pack.totalWithExtra) || totalAmount + (Number(pack.planExtraRub) || 0)),
    budget,
    level3Budget: roundPlanRub(Number(pack.level3Budget) || budget || 0),
    planExtraRub: roundPlanRub(Number(pack.planExtraRub) || 0),
    prevExtraRub: roundPlanRub(Number(pack.prevExtraRub) || 0),
    planExtraPct: Math.min(100, Math.max(0, Number(pack.planExtraPct) || 0)),
    budgetDelta: Number(pack.budgetDelta) || 0,
    budgetTolerance: Number(pack.budgetTolerance) || 0,
    fittedToBudget: pack.fittedToBudget !== false,
    byHall: pack.byHall ?? {
      pz: { nk: 0, uk: 0 },
      tz: { nk: 0, uk: 0 },
      az: { nk: 0, uk: 0 },
    },
    fromSnapshot: true,
  }
}

/**
 * @param {unknown} rawPlanRow строка плана или сам strategy_snapshot
 */
export function hydrateStrategyFromPlanRow(rawPlanRow) {
  const raw =
    rawPlanRow && typeof rawPlanRow === 'object' && 'strategy_snapshot' in rawPlanRow
      ? rawPlanRow.strategy_snapshot
      : rawPlanRow
  const parsed = parseStrategySnapshot(raw)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const suggest = renewalsSuggestFromSnapshot(parsed.snapshot)
  const pack = topUpPackFromSnapshot(parsed.snapshot)
  if (!suggest?.ok) return { ok: false, error: 'Снимок без расчёта' }
  return {
    ok: true,
    snapshot: parsed.snapshot,
    renewalsSuggest: suggest,
    topUpPack: pack,
  }
}
