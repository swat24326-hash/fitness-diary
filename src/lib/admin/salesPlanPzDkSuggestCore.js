/**
 * Ориентир плана ПЗ ДК на месяц: число действующих ПЗ по типам карт × прайс пакета 8 тр.
 * Чистая логика (без React / сети). Не трогает ТЗ/АЗ и другие ячейки матрицы.
 */

import { pickUsableMembershipForDate } from '../membershipRules.js'
import { addMonthsToIso } from '../dateRu.js'
import {
  filterPriceListCatalogTypes,
  getPriceListCell,
} from '../priceList/priceListCore.js'
import {
  planMatrixAvgField,
  planMatrixCellRub,
  planMatrixCountField,
  roundPlanRub,
} from './salesPlanMatrixCore.js'

/** Пакет-ориентир для прогноза продлений. */
export const PZ_DK_SUGGEST_SESSIONS = 8
/** Базовая колонка «1 человек» в прайсе. */
export const PZ_DK_SUGGEST_PEOPLE = 1
/** Режим прайса: полная сетка (стендовая −10% берём из ячейки). */
export const PZ_DK_SUGGEST_MODE = 'base'
/** Ячейка плана: персональный зал × действующие. */
export const PZ_DK_SUGGEST_CELL_KEY = 'pz_dk'
/** Доля продлений по умолчанию (не все ДК купят снова). */
export const PZ_DK_DEFAULT_RENEWAL_PCT = 80

/** Горизонт ориентира: текущий месяц (срез «сегодня») или следующий (срез накануне месяца плана). */
export const PZ_DK_SUGGEST_HORIZONS = Object.freeze(['current', 'next'])

/** @typedef {'current' | 'next'} PzDkSuggestHorizon */

/**
 * @param {unknown} raw
 * @returns {PzDkSuggestHorizon | null}
 */
export function normalizePzDkSuggestHorizon(raw) {
  const h = String(raw ?? '').trim().toLowerCase()
  if (h === 'current' || h === 'this' || h === 'текущий') return 'current'
  if (h === 'next' || h === 'следующий') return 'next'
  return null
}

/**
 * @param {unknown} raw
 * @returns {number} 1…100
 */
export function clampRenewalPct(raw) {
  const n = Math.round(Number(String(raw ?? '').replace(',', '.')))
  if (!Number.isFinite(n)) return PZ_DK_DEFAULT_RENEWAL_PCT
  return Math.min(100, Math.max(1, n))
}

/**
 * @param {string} iso
 * @returns {{ year: number, month: number } | null}
 */
export function calendarYearMonthFromIso(iso) {
  const s = String(iso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const year = Number(s.slice(0, 4))
  const month = Number(s.slice(5, 7))
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null
  return { year, month }
}

/**
 * Какой календарный месяц плана соответствует горизонту (от «сегодня»).
 * @param {PzDkSuggestHorizon | string} horizon
 * @param {string} todayIso
 */
export function resolveTargetPlanMonthForHorizon(horizon, todayIso) {
  const h = normalizePzDkSuggestHorizon(horizon)
  const cur = calendarYearMonthFromIso(todayIso)
  if (!h || !cur) return null
  if (h === 'current') return { year: cur.year, month: cur.month, horizon: h }
  const anchor = `${cur.year}-${String(cur.month).padStart(2, '0')}-01`
  const next = calendarYearMonthFromIso(addMonthsToIso(anchor, 1))
  if (!next) return null
  return { year: next.year, month: next.month, horizon: h }
}

/**
 * @param {number} planYear
 * @param {number} planMonth
 * @param {{ year: number, month: number }} target
 */
export function planMonthMatchesTarget(planYear, planMonth, target) {
  return Number(planYear) === Number(target?.year) && Number(planMonth) === Number(target?.month)
}

/**
 * Сумма шт. ПЗ ДК из дневных отчётов месяца (факт уже проданных продлений).
 * @param {Array<Record<string, unknown>>} rows
 */
export function sumFactPzDkCountFromDailyRows(rows) {
  let n = 0
  for (const r of rows ?? []) {
    n += Math.trunc(Number(r?.pz_dk) || 0)
  }
  return Math.max(0, n)
}

/**
 * Разбивка по типам карт после % продления (ещё до вычета факта).
 * @param {Array<{ membershipTypeId?: string, code?: string, count?: number, priceRub?: number | null }>} byType
 * @param {number} renewalPct
 */
export function buildPzDkByTypeAfterRenewal(byType, renewalPct) {
  const pct = clampRenewalPct(renewalPct)
  /** @type {Array<{ membershipTypeId: string, code: string, baseCount: number, planCount: number, priceRub: number, amount: number }>} */
  const rows = []
  for (const t of byType ?? []) {
    const priceRub = Number(t?.priceRub)
    if (!Number.isFinite(priceRub) || priceRub <= 0) continue
    const baseCount = Math.max(0, Math.trunc(Number(t?.count) || 0))
    if (baseCount <= 0) continue
    const planCount = Math.max(0, Math.round((baseCount * pct) / 100))
    if (planCount <= 0) continue
    rows.push({
      membershipTypeId: String(t.membershipTypeId ?? ''),
      code: String(t.code ?? '').trim() || '—',
      baseCount,
      planCount,
      priceRub: roundPlanRub(priceRub),
      amount: planMatrixCellRub(planCount, priceRub),
    })
  }
  return rows
}

/**
 * Пропорционально уменьшить planCount по типам, чтобы сумма = targetTotal.
 * @param {ReturnType<typeof buildPzDkByTypeAfterRenewal>} rows
 * @param {number} targetTotal
 */
export function scalePzDkByTypeToTotal(rows, targetTotal) {
  const target = Math.max(0, Math.trunc(Number(targetTotal) || 0))
  const list = (rows ?? []).map((r) => ({ ...r }))
  const sum = list.reduce((acc, r) => acc + r.planCount, 0)
  if (target <= 0 || sum <= 0) {
    return list.map((r) => ({ ...r, planCount: 0, amount: 0 }))
  }
  if (target === sum) {
    return list.map((r) => ({
      ...r,
      amount: planMatrixCellRub(r.planCount, r.priceRub),
    }))
  }
  /** @type {Array<{ i: number, exact: number, floor: number, frac: number }>} */
  const parts = list.map((r, i) => {
    const exact = (r.planCount / sum) * target
    const floor = Math.floor(exact)
    return { i, exact, floor, frac: exact - floor }
  })
  let used = parts.reduce((a, p) => a + p.floor, 0)
  let left = target - used
  parts.sort((a, b) => b.frac - a.frac)
  for (const p of parts) {
    if (left <= 0) break
    p.floor += 1
    left -= 1
  }
  return list.map((r, i) => {
    const p = parts.find((x) => x.i === i)
    const planCount = Math.max(0, p?.floor ?? 0)
    return {
      ...r,
      planCount,
      amount: planMatrixCellRub(planCount, r.priceRub),
    }
  })
}

/**
 * После сырого headcount: % продления по типам карт и (для текущего) минус факт ПЗ ДК.
 * @param {object} suggest результат buildPzDk*
 * @param {{
 *   renewalPct?: unknown,
 *   factPzDkCount?: number,
 *   horizon?: string,
 * }} opts
 */
export function refinePzDkSuggestForPlan(suggest, opts = {}) {
  if (!suggest?.ok) return suggest
  const horizon = normalizePzDkSuggestHorizon(opts.horizon) || normalizePzDkSuggestHorizon(suggest.horizon)
  const renewalPct = clampRenewalPct(opts.renewalPct)
  const rawCount = Math.max(0, Math.trunc(Number(suggest.count) || 0))

  let byTypePlan = buildPzDkByTypeAfterRenewal(suggest.byType, renewalPct)
  const afterRate = byTypePlan.reduce((acc, r) => acc + r.planCount, 0)
  const factPzDkCount =
    horizon === 'current' ? Math.max(0, Math.trunc(Number(opts.factPzDkCount) || 0)) : 0
  const count = horizon === 'current' ? Math.max(0, afterRate - factPzDkCount) : afterRate

  if (horizon === 'current' && factPzDkCount > 0 && afterRate > 0) {
    byTypePlan = scalePzDkByTypeToTotal(byTypePlan, count)
  }

  const amount = byTypePlan.reduce((acc, r) => acc + r.amount, 0)
  const avg_check = count > 0 ? roundPlanRub(amount / count) : roundPlanRub(Number(suggest.avg_check) || 0)

  if (count <= 0) {
    return {
      ...suggest,
      ok: false,
      error:
        horizon === 'current' && factPzDkCount > 0 && afterRate <= factPzDkCount
          ? `По факту уже учтено ${factPzDkCount} шт. ПЗ ДК — остаток продлений 0 при ${renewalPct}% от базы ${rawCount}`
          : `После ${renewalPct}% продления осталось 0 шт. — нечего подставлять`,
      rawCount,
      renewalPct,
      afterRate,
      factPzDkCount,
      count: 0,
      avg_check,
      amount: 0,
      byTypePlan: [],
      horizon: horizon || suggest.horizon,
    }
  }

  return {
    ...suggest,
    ok: true,
    rawCount,
    renewalPct,
    afterRate,
    factPzDkCount,
    count,
    avg_check,
    amount: roundPlanRub(amount),
    byTypePlan,
    horizon: horizon || suggest.horizon,
  }
}

/**
 * Дата среза базы для плана месяца Y-M: последний день предыдущего месяца
 * (кто был ДК накануне → ориентир продлений в месяце плана).
 * @param {number} year
 * @param {number} month 1–12
 */
export function asOfIsoBeforePlanMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const lastPrev = new Date(y, m - 1, 0)
  const yy = lastPrev.getFullYear()
  const mm = String(lastPrev.getMonth() + 1).padStart(2, '0')
  const dd = String(lastPrev.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Последний день календарного месяца Y-M.
 * @param {number} year
 * @param {number} month 1–12
 */
export function lastDayIsoOfMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  const last = new Date(y, m, 0)
  const yy = last.getFullYear()
  const mm = String(last.getMonth() + 1).padStart(2, '0')
  const dd = String(last.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Дата среза по горизонту.
 * - current: действующие «сегодня» (для плана текущего месяца).
 * - next: накануне месяца плана (для плана следующего месяца).
 *
 * @param {{
 *   horizon: PzDkSuggestHorizon | string,
 *   year: number,
 *   month: number,
 *   todayIso?: string,
 * }} opts
 * @returns {{ ok: true, asOfIso: string, horizon: PzDkSuggestHorizon } | { ok: false, error: string }}
 */
export function resolvePzDkSuggestAsOfIso(opts) {
  const horizon = normalizePzDkSuggestHorizon(opts?.horizon)
  if (!horizon) return { ok: false, error: 'Укажите горизонт: текущий или следующий месяц' }

  const today = String(opts?.todayIso ?? '').slice(0, 10)
  if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return { ok: false, error: 'Некорректная дата «сегодня»' }
  }

  if (horizon === 'current') {
    if (!today) return { ok: false, error: 'Нужна дата сегодня для среза текущего месяца' }
    const lastOfPlan = lastDayIsoOfMonth(opts.year, opts.month)
    // Не смотрим «в будущее» внутри месяца плана и не берём дни после конца месяца.
    const asOfIso = lastOfPlan && today > lastOfPlan ? lastOfPlan : today
    return { ok: true, asOfIso, horizon }
  }

  const asOfIso = asOfIsoBeforePlanMonth(opts.year, opts.month)
  if (!asOfIso) return { ok: false, error: 'Некорректный месяц плана' }
  return { ok: true, asOfIso, horizon }
}

/**
 * @param {PzDkSuggestHorizon | string} horizon
 */
export function pzDkSuggestHorizonLabelRu(horizon) {
  const h = normalizePzDkSuggestHorizon(horizon)
  if (h === 'current') return 'текущий месяц'
  if (h === 'next') return 'следующий месяц'
  return 'месяц'
}

/**
 * Цена пакета из ячейки прайса: сначала стенд (−10%), иначе полная.
 * @param {{ price_full?: number | null, price_10?: number | null } | null | undefined} cell
 * @returns {number | null}
 */
export function resolvePackagePriceRub(cell) {
  const stand = Number(cell?.price_10)
  if (Number.isFinite(stand) && stand > 0) return roundPlanRub(stand)
  const full = Number(cell?.price_full)
  if (Number.isFinite(full) && full > 0) return roundPlanRub(full)
  return null
}

/**
 * Сколько клиентов с usable ПЗ на дату, сгруппировано по membership_type_id.
 * Архивные клиенты не считаем. Один клиент — один usable абонемент (как в дневнике).
 *
 * @param {{
 *   memberships?: object[],
 *   clients?: object[],
 *   catalogTypeIds?: Iterable<string>,
 *   asOfIso: string,
 * }} input
 * @returns {Map<string, number>}
 */
export function countUsablePzClientsByType(input) {
  const asOf = String(input?.asOfIso ?? '').slice(0, 10)
  /** @type {Map<string, number>} */
  const out = new Map()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return out

  const catalog = new Set(
    [...(input?.catalogTypeIds ?? [])].map((id) => String(id ?? '').trim()).filter(Boolean),
  )
  if (!catalog.size) return out

  /** @type {Map<string, object[]>} */
  const byClient = new Map()
  for (const m of input?.memberships ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid) continue
    if (!byClient.has(cid)) byClient.set(cid, [])
    byClient.get(cid).push(m)
  }

  /** @type {Set<string> | null} */
  let activeClients = null
  if (Array.isArray(input?.clients) && input.clients.length) {
    activeClients = new Set()
    for (const c of input.clients) {
      const id = String(c?.id ?? '').trim()
      if (!id) continue
      if (c?.archived_at) continue
      activeClients.add(id)
    }
  }

  for (const [clientId, list] of byClient) {
    if (activeClients && !activeClients.has(clientId)) continue
    const usable = pickUsableMembershipForDate(list, asOf)
    if (!usable) continue
    const typeId = String(usable.membership_type_id ?? '').trim()
    if (!typeId || !catalog.has(typeId)) continue
    out.set(typeId, (out.get(typeId) ?? 0) + 1)
  }
  return out
}

/**
 * @param {{
 *   priceListDoc: object,
 *   membershipTypes?: object[],
 *   headcountsByTypeId: Map<string, number> | Record<string, number>,
 *   sessions?: number,
 *   people?: number,
 *   mode?: string,
 * }} input
 */
export function buildPzDkSuggestFromHeadcounts(input) {
  const sessions = Number(input?.sessions) > 0 ? Number(input.sessions) : PZ_DK_SUGGEST_SESSIONS
  const people = Number(input?.people) > 0 ? Number(input.people) : PZ_DK_SUGGEST_PEOPLE
  const mode = input?.mode || PZ_DK_SUGGEST_MODE
  const catalog = filterPriceListCatalogTypes(input?.membershipTypes ?? [])

  /** @type {Map<string, number>} */
  let headcounts
  if (input?.headcountsByTypeId instanceof Map) {
    headcounts = input.headcountsByTypeId
  } else {
    headcounts = new Map(
      Object.entries(input?.headcountsByTypeId ?? {}).map(([k, v]) => [String(k), Number(v) || 0]),
    )
  }

  /** @type {Array<{ membershipTypeId: string, code: string, count: number, priceRub: number | null }>} */
  const byType = []
  /** @type {string[]} */
  const missingPriceCodes = []
  let totalCount = 0
  let weightedSum = 0

  for (const t of catalog) {
    const id = String(t.id).trim()
    const count = Math.max(0, Math.trunc(Number(headcounts.get(id)) || 0))
    if (count <= 0) continue
    const cell = getPriceListCell(input.priceListDoc, {
      sessions,
      people,
      membershipTypeId: id,
      mode,
    })
    const priceRub = resolvePackagePriceRub(cell)
    const code = String(t.code ?? '').trim() || id.slice(0, 8)
    byType.push({ membershipTypeId: id, code, count, priceRub })
    if (priceRub == null) {
      missingPriceCodes.push(code)
      continue
    }
    totalCount += count
    weightedSum += count * priceRub
  }

  if (totalCount <= 0) {
    return {
      ok: false,
      error:
        missingPriceCodes.length > 0
          ? `У действующих карт нет цены пакета ${sessions} тр. в прайсе (${missingPriceCodes.join(', ')})`
          : 'Нет действующих клиентов ПЗ на дату среза — нечего подставлять в ПЗ ДК',
      cellKey: PZ_DK_SUGGEST_CELL_KEY,
      sessions,
      people,
      mode,
      count: 0,
      avg_check: 0,
      amount: 0,
      byType,
      missingPriceCodes,
    }
  }

  const avg_check = roundPlanRub(weightedSum / totalCount)
  const amount = planMatrixCellRub(totalCount, avg_check)

  return {
    ok: true,
    cellKey: PZ_DK_SUGGEST_CELL_KEY,
    sessions,
    people,
    mode,
    count: totalCount,
    avg_check,
    amount,
    byType,
    missingPriceCodes,
    skippedWithoutPrice: missingPriceCodes.length,
  }
}

/**
 * Полный расчёт ориентира из сырых списков.
 * @param {{
 *   priceListDoc: object,
 *   membershipTypes?: object[],
 *   memberships?: object[],
 *   clients?: object[],
 *   asOfIso: string,
 *   horizon?: string,
 *   sessions?: number,
 *   people?: number,
 *   mode?: string,
 * }} input
 */
export function buildPzDkPlanSuggest(input) {
  const catalog = filterPriceListCatalogTypes(input?.membershipTypes ?? [])
  const catalogTypeIds = catalog.map((t) => String(t.id).trim())
  const headcountsByTypeId = countUsablePzClientsByType({
    memberships: input?.memberships,
    clients: input?.clients,
    catalogTypeIds,
    asOfIso: input?.asOfIso,
  })
  const suggest = buildPzDkSuggestFromHeadcounts({
    priceListDoc: input.priceListDoc,
    membershipTypes: catalog,
    headcountsByTypeId,
    sessions: input?.sessions,
    people: input?.people,
    mode: input?.mode,
  })
  return {
    ...suggest,
    asOfIso: String(input?.asOfIso ?? '').slice(0, 10),
    horizon: normalizePzDkSuggestHorizon(input?.horizon) || undefined,
    catalogTypeCount: catalog.length,
  }
}

/**
 * Подставить только ячейку pz_dk в форму плана (остальное без изменений).
 * @param {Record<string, string>} planForm
 * @param {{ count: number, avg_check: number }} suggest
 */
export function applyPzDkSuggestToPlanForm(planForm, suggest) {
  const base = planForm && typeof planForm === 'object' ? { ...planForm } : {}
  const count = Math.max(0, Math.trunc(Number(suggest?.count) || 0))
  const avg = roundPlanRub(Number(suggest?.avg_check) || 0)
  base[planMatrixCountField(PZ_DK_SUGGEST_CELL_KEY)] = count > 0 ? String(count) : ''
  base[planMatrixAvgField(PZ_DK_SUGGEST_CELL_KEY)] = avg > 0 ? String(avg) : ''
  return base
}

/**
 * Короткая подпись для UI.
 * @param {object} suggest
 */
export function formatPzDkSuggestSummaryRu(suggest) {
  const count = Math.trunc(Number(suggest?.count) || 0)
  const avg = roundPlanRub(Number(suggest?.avg_check) || 0)
  const amount = roundPlanRub(Number(suggest?.amount) || 0)
  const sessions = Number(suggest?.sessions) || PZ_DK_SUGGEST_SESSIONS
  const asOf = String(suggest?.asOfIso ?? '').slice(0, 10)
  const skip = Number(suggest?.skippedWithoutPrice) || 0
  const renewalPct = Number(suggest?.renewalPct)
  const rawCount = Number(suggest?.rawCount)
  const fact = Number(suggest?.factPzDkCount)
  const parts = []
  if (suggest?.horizon) parts.push(pzDkSuggestHorizonLabelRu(suggest.horizon))
  if (Number.isFinite(rawCount) && rawCount >= 0 && Number.isFinite(renewalPct)) {
    parts.push(`база ${Math.trunc(rawCount)} × ${renewalPct}%`)
  }
  if (Number.isFinite(fact) && fact > 0) parts.push(`− факт ${Math.trunc(fact)}`)
  parts.push(
    `план ${count} шт.`,
    `ср. чек ${new Intl.NumberFormat('ru-RU').format(Math.round(avg))} ₽`,
    `${new Intl.NumberFormat('ru-RU').format(Math.round(amount))} ₽`,
    `пакет ${sessions} тр.`,
  )
  if (asOf) parts.push(`срез ${asOf}`)
  if (skip > 0) parts.push(`без цены: ${skip} тип.`)
  return parts.join(' · ')
}
