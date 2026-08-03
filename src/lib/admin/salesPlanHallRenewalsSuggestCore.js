/**
 * Ориентир продлений ДК по ПЗ / ТЗ / АЗ:
 * клиенты (не архив) с абоном, кончающимся в месяце плана;
 * средний чек = среднее из последних N покупок с paid_amount (если меньше N — по тем, что есть).
 */

import {
  clampRenewalPct,
  normalizePzDkSuggestHorizon,
  PZ_DK_DEFAULT_RENEWAL_PCT,
  resolvePzDkSuggestAsOfIso,
  resolveTargetPlanMonthForHorizon,
} from './salesPlanPzDkSuggestCore.js'
import {
  planMatrixAvgField,
  planMatrixCountField,
  roundPlanRub,
} from './salesPlanMatrixCore.js'
import { resolvePriceListCheckRub } from './salesPlanHallRenewalsPriceCore.js'

export { clampRenewalPct, normalizePzDkSuggestHorizon, resolveTargetPlanMonthForHorizon }
export { resolvePzDkSuggestAsOfIso as resolveHallRenewalsAsOfIso }

export const HALL_RENEWALS_DEFAULT_PCT = PZ_DK_DEFAULT_RENEWAL_PCT
/** Сколько последних покупок усреднять (можно меньше, если истории нет). */
export const HALL_RENEWALS_DEFAULT_HISTORY = 3
export const HALL_RENEWALS_HISTORY_MIN = 1
export const HALL_RENEWALS_HISTORY_MAX = 12

/** @type {ReadonlyArray<{ hall: 'pz'|'tz'|'az', cellKey: string, label: string }>} */
export const HALL_RENEWALS_HALLS = Object.freeze([
  { hall: 'pz', cellKey: 'pz_dk', label: 'ПЗ' },
  { hall: 'tz', cellKey: 'tz_dk', label: 'ТЗ' },
  { hall: 'az', cellKey: 'az_dk', label: 'АЗ' },
])

/**
 * @param {unknown} raw
 * @returns {number} 1…12
 */
export function clampPurchaseHistoryDepth(raw) {
  const n = Math.round(Number(String(raw ?? '').replace(',', '.')))
  if (!Number.isFinite(n)) return HALL_RENEWALS_DEFAULT_HISTORY
  return Math.min(HALL_RENEWALS_HISTORY_MAX, Math.max(HALL_RENEWALS_HISTORY_MIN, n))
}

/**
 * @param {object|null|undefined} client
 */
export function isClientExcludedFromRenewals(client) {
  if (!client) return true
  if (client.archived_at) return true
  const life = String(client.lifecycle ?? '').trim().toLowerCase()
  if (life === 'archived' || life === 'archive') return true
  return false
}

/**
 * @param {object|null|undefined} client
 * @returns {'pz'|'tz'|'az'|null}
 */
export function resolveClientRenewalHall(client) {
  if (!client || isClientExcludedFromRenewals(client)) return null
  const desk = String(client.desk_hall ?? '')
    .trim()
    .toLowerCase()
  if (desk === 'tz') return 'tz'
  if (desk === 'az') return 'az'
  if (client.trainer_id) return 'pz'
  return null
}

/**
 * @param {string} endIso
 * @param {number} year
 * @param {number} month
 */
export function membershipEndsInPlanMonth(endIso, year, month) {
  const end = String(endIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return false
  const prefix = `${y}-${String(m).padStart(2, '0')}`
  return end.startsWith(prefix)
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parsePaidAmountRub(raw) {
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return roundPlanRub(n)
}

/**
 * Дата сортировки покупки: конец → старт → updated.
 * @param {object} m
 */
export function membershipPurchaseSortKey(m) {
  const end = String(m?.end_date ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(end)) return end
  const start = String(m?.start_date ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start
  const upd = String(m?.updated_at ?? m?.created_at ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(upd) ? upd : ''
}

/**
 * Среднее из последних depth покупок с paid_amount; если меньше — по имеющимся.
 * @param {object[]} memberships клиента
 * @param {number} depth
 * @returns {{ avgRub: number|null, sampleCount: number, amounts: number[] }}
 */
export function averageLastPaidPurchases(memberships, depth) {
  const d = clampPurchaseHistoryDepth(depth)
  const paid = []
  for (const m of memberships ?? []) {
    const rub = parsePaidAmountRub(m?.paid_amount)
    if (rub == null) continue
    paid.push({ rub, key: membershipPurchaseSortKey(m) })
  }
  paid.sort((a, b) => {
    if (a.key && b.key && a.key !== b.key) return a.key < b.key ? 1 : -1
    if (a.key && !b.key) return -1
    if (!a.key && b.key) return 1
    return 0
  })
  const slice = paid.slice(0, d)
  const amounts = slice.map((x) => x.rub)
  if (!amounts.length) return { avgRub: null, sampleCount: 0, amounts: [] }
  const sum = amounts.reduce((a, b) => a + b, 0)
  return {
    avgRub: roundPlanRub(sum / amounts.length),
    sampleCount: amounts.length,
    amounts,
  }
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} cellKey pz_dk | tz_dk | az_dk
 */
export function sumFactDkCountFromDailyRows(rows, cellKey) {
  const key = String(cellKey ?? '').trim()
  if (!key) return 0
  let n = 0
  for (const r of rows ?? []) {
    n += Math.trunc(Number(r?.[key]) || 0)
  }
  return Math.max(0, n)
}

/**
 * Является ли membership следующим пакетом после ending (уже купили продление).
 * @param {object} m
 * @param {object} endingMembership
 * @param {string} endIso
 * @param {string} endId
 */
function isRenewalSuccessorMembership(m, endingMembership, endIso, endId) {
  if (!m || m === endingMembership) return false
  if (endId && m?.id != null && String(m.id) === endId) return false
  const start = String(m?.start_date ?? '').slice(0, 10)
  const mEnd = String(m?.end_date ?? '').slice(0, 10)
  // Следующий пакет стартует в день конца текущего или позже
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && start >= endIso) return true
  // Уже куплено перекрытие / ранний старт: конец позже текущего, старт не позже текущего конца
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(mEnd) &&
    mEnd > endIso &&
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    start <= endIso
  ) {
    return true
  }
  return false
}

/**
 * Найти купленный следующий абон (если несколько — более поздний start, затем больший paid).
 * @param {object[]} memberships клиента
 * @param {object} endingMembership абон, кончающийся в месяце плана
 * @returns {object|null}
 */
export function findRenewalSuccessorMembership(memberships, endingMembership) {
  const endIso = String(endingMembership?.end_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return null
  const endId = endingMembership?.id != null ? String(endingMembership.id) : ''

  /** @type {object[]} */
  const matches = []
  for (const m of memberships ?? []) {
    if (isRenewalSuccessorMembership(m, endingMembership, endIso, endId)) matches.push(m)
  }
  if (!matches.length) return null
  matches.sort((a, b) => {
    const as = String(a?.start_date ?? '').slice(0, 10)
    const bs = String(b?.start_date ?? '').slice(0, 10)
    if (as !== bs) return as < bs ? 1 : -1
    const ap = parsePaidAmountRub(a?.paid_amount) ?? 0
    const bp = parsePaidAmountRub(b?.paid_amount) ?? 0
    return bp - ap
  })
  return matches[0]
}

/**
 * Уже купил следующий абон: не ждём продления в месяце закрытия текущего.
 * Пример: старый кончается 10.08, новый куплен заранее со стартом 10.08 → конец 10.09.
 * @param {object[]} memberships клиента
 * @param {object} endingMembership абон, кончающийся в месяце плана
 */
export function membershipHasAlreadyPurchasedSuccessor(memberships, endingMembership) {
  return Boolean(findRenewalSuccessorMembership(memberships, endingMembership))
}

/**
 * Ориентир чека: история / прайс. `membershipsForAvg` — без successor, чтобы факт не портил среднее.
 * @returns {{ avgRub: number|null, sampleCount: number, source: 'history'|'price_list'|null }}
 */
function resolveRenewalOrientCheck(opts) {
  const hist = averageLastPaidPurchases(opts.membershipsForAvg, opts.historyDepth)
  let avgRub = hist.avgRub
  let sampleCount = hist.sampleCount
  /** @type {'history'|'price_list'|null} */
  let source = hist.avgRub != null ? 'history' : null
  if (avgRub == null) {
    avgRub = resolvePriceListCheckRub({
      hall: opts.hall,
      membership: opts.endingMembership,
      pzPriceListDoc: opts.pzPriceListDoc,
      tzPriceListDoc: opts.tzPriceListDoc,
      azPriceListDoc: opts.azPriceListDoc,
    })
    sampleCount = 0
    source = avgRub != null ? 'price_list' : null
  }
  return { avgRub, sampleCount, source }
}

/**
 * Кандидаты: не архив, зал известен, абон кончается в месяце плана,
 * и ещё нет купленного следующего абона.
 * Чек: среднее последних покупок; если истории нет — прайс зала.
 * @param {{
 *   clients: object[],
 *   memberships: object[],
 *   year: number,
 *   month: number,
 *   historyDepth?: unknown,
 *   pzPriceListDoc?: object|null,
 *   tzPriceListDoc?: object|null,
 *   azPriceListDoc?: object|null,
 * }} input
 */
export function collectHallRenewalCandidates(input) {
  const year = Number(input?.year)
  const month = Number(input?.month)
  const historyDepth = clampPurchaseHistoryDepth(input?.historyDepth)
  /** @type {Map<string, object>} */
  const clientById = new Map()
  for (const c of input?.clients ?? []) {
    if (!c?.id || isClientExcludedFromRenewals(c)) continue
    clientById.set(String(c.id), c)
  }

  /** @type {Map<string, object[]>} */
  const memByClient = new Map()
  for (const m of input?.memberships ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid || !clientById.has(cid)) continue
    if (!memByClient.has(cid)) memByClient.set(cid, [])
    memByClient.get(cid).push(m)
  }

  /** @type {Array<{
   *   clientId: string,
   *   hall: 'pz'|'tz'|'az',
   *   endDate: string,
   *   avgRub: number,
   *   sampleCount: number,
   *   source: 'history'|'price_list',
   * }>} */
  const candidates = []
  /** @type {Array<{
   *   clientId: string,
   *   clientName: string,
   *   phone: string,
   *   cardNumber: string,
   *   hall: 'pz'|'tz'|'az',
   *   endDate: string,
   *   avgRub: number|null,
   *   sampleCount: number,
   *   source: 'history'|'price_list'|null,
   *   factAmount: number|null,
   *   confirmed: true,
   * }>} */
  const confirmedClosings = []
  let endingWithoutPrice = 0
  let endingSkippedHall = 0
  let endingAlreadyPurchased = 0
  let fromHistory = 0
  let fromPriceList = 0

  for (const [cid, client] of clientById) {
    const hall = resolveClientRenewalHall(client)
    const list = memByClient.get(cid) ?? []
    const ending = list.filter((m) => membershipEndsInPlanMonth(m?.end_date, year, month))
    if (!ending.length) continue
    if (!hall) {
      endingSkippedHall += 1
      continue
    }
    ending.sort((a, b) => {
      const ae = String(a?.end_date ?? '')
      const be = String(b?.end_date ?? '')
      return ae < be ? 1 : ae > be ? -1 : 0
    })
    const endingMembership = ending[0]
    const endDate = String(endingMembership?.end_date ?? '').slice(0, 10)
    const clientName = String(
      client?.full_name || client?.name || client?.fio || '',
    ).trim()
    const phone = String(client?.phone ?? '').trim()
    const cardNumber = String(client?.card_number ?? '').trim()

    const successor = findRenewalSuccessorMembership(list, endingMembership)
    if (successor) {
      endingAlreadyPurchased += 1
      const succId = successor?.id != null ? String(successor.id) : ''
      const withoutSucc = list.filter((m) => !(succId && m?.id != null && String(m.id) === succId))
      const orient = resolveRenewalOrientCheck({
        membershipsForAvg: withoutSucc,
        endingMembership,
        hall,
        historyDepth,
        pzPriceListDoc: input.pzPriceListDoc,
        tzPriceListDoc: input.tzPriceListDoc,
        azPriceListDoc: input.azPriceListDoc,
      })
      confirmedClosings.push({
        clientId: cid,
        clientName,
        phone,
        cardNumber,
        hall,
        endDate,
        avgRub: orient.avgRub,
        sampleCount: orient.sampleCount,
        source: orient.source,
        factAmount: parsePaidAmountRub(successor?.paid_amount),
        confirmed: true,
      })
      continue
    }

    const orient = resolveRenewalOrientCheck({
      membershipsForAvg: list,
      endingMembership,
      hall,
      historyDepth,
      pzPriceListDoc: input.pzPriceListDoc,
      tzPriceListDoc: input.tzPriceListDoc,
      azPriceListDoc: input.azPriceListDoc,
    })
    if (orient.avgRub == null || !orient.source) {
      endingWithoutPrice += 1
      continue
    }
    if (orient.source === 'history') fromHistory += 1
    else fromPriceList += 1
    candidates.push({
      clientId: cid,
      clientName,
      phone,
      cardNumber,
      hall,
      endDate,
      avgRub: orient.avgRub,
      sampleCount: orient.sampleCount,
      source: orient.source,
    })
  }

  return {
    candidates,
    confirmedClosings,
    historyDepth,
    endingWithoutPrice,
    endingSkippedHall,
    endingAlreadyPurchased,
    fromHistory,
    fromPriceList,
  }
}

/**
 * Деньги точнее: база ₽ = Σ чеков кандидатов × %.
 * Факт ДК из дневного отчёта в Стратегии не вычитаем — он уже в плане/отчёте.
 * @param {{
 *   rawCount: number,
 *   sumAvgRub: number,
 *   renewalPct: number,
 *   factCount?: number,
 *   horizon?: string,
 * }} opts
 */
export function refineHallRenewalCell(opts) {
  const renewalPct = clampRenewalPct(opts.renewalPct)
  const rawCount = Math.max(0, Math.trunc(Number(opts.rawCount) || 0))
  const sumAvgRub = Math.max(0, Number(opts.sumAvgRub) || 0)
  const afterRate = Math.max(0, Math.round((rawCount * renewalPct) / 100))
  const count = afterRate
  const poolAvg = rawCount > 0 ? roundPlanRub(sumAvgRub / rawCount) : 0
  const expectedAmount = roundPlanRub((sumAvgRub * renewalPct) / 100)
  const amount = expectedAmount
  const avg_check = count > 0 ? roundPlanRub(amount / count) : poolAvg
  return {
    rawCount,
    renewalPct,
    afterRate,
    factCount: 0,
    count,
    avg_check,
    amount: roundPlanRub(amount),
    poolAvg,
    expectedAmount,
  }
}

/**
 * @param {{
 *   clients: object[],
 *   memberships: object[],
 *   year: number,
 *   month: number,
 *   horizon?: string,
 *   renewalPct?: unknown,
 *   historyDepth?: unknown,
 *   asOfIso?: string,
 *   pzPriceListDoc?: object|null,
 *   tzPriceListDoc?: object|null,
 *   azPriceListDoc?: object|null,
 * }} input
 */
export function buildHallRenewalsSuggest(input) {
  const horizon = normalizePzDkSuggestHorizon(input?.horizon) || 'current'
  const renewalPct = clampRenewalPct(input?.renewalPct)
  const historyDepth = clampPurchaseHistoryDepth(input?.historyDepth)
  const year = Number(input?.year)
  const month = Number(input?.month)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { ok: false, error: 'Некорректный месяц плана' }
  }

  const collected = collectHallRenewalCandidates({
    clients: input?.clients,
    memberships: input?.memberships,
    year,
    month,
    historyDepth,
    pzPriceListDoc: input.pzPriceListDoc,
    tzPriceListDoc: input.tzPriceListDoc,
    azPriceListDoc: input.azPriceListDoc,
  })

  /** @type {Record<string, object>} */
  const byHall = {}
  let totalCount = 0
  let totalAmount = 0
  let totalRaw = 0

  for (const def of HALL_RENEWALS_HALLS) {
    const hallCands = collected.candidates.filter((c) => c.hall === def.hall)
    const sumAvgRub = hallCands.reduce((a, c) => a + c.avgRub, 0)
    const refined = refineHallRenewalCell({
      rawCount: hallCands.length,
      sumAvgRub,
      renewalPct,
      horizon,
    })
    byHall[def.hall] = {
      ...def,
      ...refined,
      sampleDepth: historyDepth,
    }
    totalCount += refined.count
    totalAmount += refined.amount
    totalRaw += refined.rawCount
  }

  const priceMeta = {
    fromHistory: collected.fromHistory,
    fromPriceList: collected.fromPriceList,
    endingWithoutPrice: collected.endingWithoutPrice,
    endingSkippedHall: collected.endingSkippedHall,
    endingAlreadyPurchased: collected.endingAlreadyPurchased,
  }

  const confirmedClosings = Array.isArray(collected.confirmedClosings)
    ? collected.confirmedClosings
    : []

  if (
    totalRaw <= 0 &&
    collected.endingWithoutPrice <= 0 &&
    collected.endingAlreadyPurchased <= 0
  ) {
    return {
      ok: false,
      error: 'Нет клиентов с окончанием абона в этом месяце (и нет цены в прайсе)',
      byHall,
      historyDepth,
      ...priceMeta,
      horizon,
      year,
      month,
      asOfIso: String(input?.asOfIso ?? '').slice(0, 10),
      renewalPct,
      candidates: [],
      confirmedClosings,
    }
  }

  if (totalCount <= 0) {
    // Все уже купили следующий абон — пакет ДК пуст, но playbook покажет галочки.
    if (confirmedClosings.length > 0) {
      return {
        ok: true,
        byHall,
        historyDepth,
        ...priceMeta,
        horizon,
        year,
        month,
        asOfIso: String(input?.asOfIso ?? '').slice(0, 10),
        renewalPct,
        count: 0,
        amount: 0,
        avg_check: 0,
        candidates: [],
        confirmedClosings,
        note:
          'Кто кончается в месяце — уже купили следующий абон; в ДК подставлять некого (галочки в playbook)',
      }
    }
    const alreadyMsg =
      collected.endingAlreadyPurchased > 0 && collected.candidates.length === 0
        ? 'Кто кончается в месяце — уже купили следующий абон; в ДК подставлять некого'
        : horizon === 'current'
          ? 'После % продления остаток 0 — нечего подставлять'
          : 'После % продления осталось 0 шт.'
    return {
      ok: false,
      error: alreadyMsg,
      byHall,
      historyDepth,
      ...priceMeta,
      horizon,
      year,
      month,
      asOfIso: String(input?.asOfIso ?? '').slice(0, 10),
      renewalPct,
      count: 0,
      amount: 0,
      candidates: [],
      confirmedClosings,
    }
  }

  return {
    ok: true,
    byHall,
    historyDepth,
    ...priceMeta,
    horizon,
    year,
    month,
    asOfIso: String(input?.asOfIso ?? '').slice(0, 10),
    renewalPct,
    count: totalCount,
    amount: roundPlanRub(totalAmount),
    avg_check: totalCount > 0 ? roundPlanRub(totalAmount / totalCount) : 0,
    /** Открытые закрытия для playbook (до % / факта — ориентир чека). */
    candidates: collected.candidates,
    /** Уже купили следующий абон — галочка + факт ₽ в playbook. */
    confirmedClosings,
  }
}

/**
 * @param {Record<string, string>} planForm
 * @param {object} suggest
 */
export function applyHallRenewalsSuggestToPlanForm(planForm, suggest) {
  const base = planForm && typeof planForm === 'object' ? { ...planForm } : {}
  for (const def of HALL_RENEWALS_HALLS) {
    const cell = suggest?.byHall?.[def.hall]
    if (!cell) continue
    const count = Math.max(0, Math.trunc(Number(cell.count) || 0))
    const avg = roundPlanRub(Number(cell.avg_check) || 0)
    base[planMatrixCountField(def.cellKey)] = count > 0 ? String(count) : ''
    base[planMatrixAvgField(def.cellKey)] = avg > 0 ? String(avg) : ''
  }
  return base
}

/**
 * @param {object} suggest
 */
export function formatHallRenewalsSummaryRu(suggest) {
  const parts = []
  const depth = Number(suggest?.historyDepth) || HALL_RENEWALS_DEFAULT_HISTORY
  const pct = Number(suggest?.renewalPct)
  parts.push(`среднее из до ${depth} покупок`)
  if (Number.isFinite(pct)) parts.push(`${pct}% продления`)
  for (const def of HALL_RENEWALS_HALLS) {
    const cell = suggest?.byHall?.[def.hall]
    if (!cell) continue
    const c = Math.trunc(Number(cell.count) || 0)
    if (c <= 0 && Math.trunc(Number(cell.rawCount) || 0) <= 0) continue
    parts.push(
      `${def.label} ${c} шт. / ${new Intl.NumberFormat('ru-RU').format(Math.round(Number(cell.amount) || 0))} ₽`,
    )
  }
  const hist = Number(suggest?.fromHistory) || 0
  const price = Number(suggest?.fromPriceList) || 0
  if (hist > 0) parts.push(`история: ${hist}`)
  if (price > 0) parts.push(`прайс: ${price}`)
  const miss = Number(suggest?.endingWithoutPrice) || 0
  if (miss > 0) parts.push(`без цены: ${miss}`)
  const bought = Number(suggest?.endingAlreadyPurchased) || 0
  if (bought > 0) parts.push(`уже купили след.: ${bought}`)
  return parts.join(' · ')
}
