/**
 * Playbook месяца: недели, бакеты закрытий, темп ₽, прогресс факта.
 * Без React / IndexedDB.
 */

import { roundPlanRub } from './salesPlanMatrixCore.js'
import { parseSalesMoney } from './salesReportCore.js'

/**
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} day
 */
function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Календарные недели месяца (пн–вс), обрезанные границами месяца.
 * @param {number} year
 * @param {number} month
 * @returns {Array<{ index: number, label: string, startIso: string, endIso: string, dayCount: number }>}
 */
export function buildMonthWeekBuckets(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return []

  const daysInMonth = new Date(y, m, 0).getDate()
  /** @type {ReturnType<typeof buildMonthWeekBuckets>} */
  const weeks = []
  let day = 1
  let index = 0
  while (day <= daysInMonth) {
    const startDay = day
    const startDate = new Date(y, m - 1, day)
    const dow = startDate.getDay() // 0=вс … 6=сб
    const daysUntilSunday = dow === 0 ? 0 : 7 - dow
    const endDay = Math.min(daysInMonth, day + daysUntilSunday)
    weeks.push({
      index,
      label: `W${index + 1}`,
      startIso: isoDate(y, m, startDay),
      endIso: isoDate(y, m, endDay),
      dayCount: endDay - startDay + 1,
    })
    index += 1
    day = endDay + 1
  }
  return weeks
}

/**
 * @param {string} iso
 * @param {{ startIso: string, endIso: string }} week
 */
export function isoInWeek(iso, week) {
  const d = String(iso ?? '').slice(0, 10)
  if (!d || !week?.startIso || !week?.endIso) return false
  return d >= week.startIso && d <= week.endIso
}

/**
 * @param {Array<{ endDate?: string, end_date?: string, amount?: number, hall?: string, clientId?: string, clientName?: string, confirmed?: boolean, factAmount?: number|null }>} endingRows
 * @param {ReturnType<typeof buildMonthWeekBuckets>} weeks
 */
export function bucketEndingsByWeek(endingRows, weeks) {
  /** @type {Array<Array<object>>} */
  const buckets = weeks.map(() => [])
  for (const row of endingRows ?? []) {
    const endDate = String(row?.endDate ?? row?.end_date ?? '').slice(0, 10)
    if (!endDate) continue
    const wi = weeks.findIndex((w) => isoInWeek(endDate, w))
    if (wi < 0) continue
    const clientId = String(row?.clientId ?? '')
    const hall = row?.hall === 'tz' || row?.hall === 'az' ? row.hall : 'pz'
    const dedupeKey = `${clientId}|${endDate}|${hall}`
    const confirmed = Boolean(row?.confirmed)
    const factRaw = row?.factAmount
    const factAmount =
      factRaw == null || factRaw === ''
        ? null
        : roundPlanRub(Math.max(0, Number(factRaw) || 0)) || null
    const next = {
      clientId,
      clientName: String(row?.clientName ?? '').trim() || 'Без имени',
      phone: String(row?.phone ?? '').trim(),
      cardNumber: String(row?.cardNumber ?? row?.card_number ?? '').trim(),
      hall,
      endDate,
      amount: roundPlanRub(Number(row?.amount) || 0),
      source: row?.source || '',
      confirmed,
      factAmount,
    }
    if (clientId) {
      const prevIdx = buckets[wi].findIndex(
        (r) => `${r.clientId}|${r.endDate}|${r.hall}` === dedupeKey,
      )
      if (prevIdx >= 0) {
        // Confirmed побеждает open; иначе не дублируем.
        if (confirmed || !buckets[wi][prevIdx].confirmed) {
          buckets[wi][prevIdx] = next
        }
        continue
      }
    }
    buckets[wi].push(next)
  }
  for (const list of buckets) {
    list.sort((a, b) => {
      // Сначала открытые, потом с галочкой.
      if (Boolean(a.confirmed) !== Boolean(b.confirmed)) {
        return a.confirmed ? 1 : -1
      }
      if (a.endDate < b.endDate) return -1
      if (a.endDate > b.endDate) return 1
      return String(a.clientName).localeCompare(String(b.clientName), 'ru')
    })
  }
  return buckets
}

/**
 * Цели ₽ на неделю: база равномерно + лёгкий перекос по числу закрытий (вес = 1 + count).
 * @param {number} packTotal
 * @param {ReturnType<typeof buildMonthWeekBuckets>} weeks
 * @param {number[]} [endingCounts]
 */
export function paceWeekTargets(packTotal, weeks, endingCounts) {
  const n = weeks?.length || 0
  const pack = roundPlanRub(Math.max(0, Number(packTotal) || 0))
  if (n <= 0) return []
  if (!(pack > 0)) return weeks.map(() => 0)

  const weights = weeks.map((_, i) => 1 + Math.max(0, Math.trunc(Number(endingCounts?.[i]) || 0)))
  const wSum = weights.reduce((a, b) => a + b, 0) || n
  /** @type {number[]} */
  const targets = []
  let assigned = 0
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      targets.push(roundPlanRub(pack - assigned))
    } else {
      const t = roundPlanRub(pack * (weights[i] / wSum))
      targets.push(t)
      assigned = roundPlanRub(assigned + t)
    }
  }
  return targets
}

/**
 * @param {number} factRub
 * @param {number} weekTarget
 */
export function weekProgress(factRub, weekTarget) {
  const target = roundPlanRub(Math.max(0, Number(weekTarget) || 0))
  const fact = roundPlanRub(Math.max(0, Number(factRub) || 0))
  const pct =
    target > 0 ? Math.min(999, Math.round((fact / target) * 100)) : fact > 0 ? 100 : 0
  return {
    fact,
    target,
    pct,
    gap: roundPlanRub(target - fact),
  }
}

/**
 * Σ profit_day по дням в диапазоне [startIso, endIso].
 * @param {Array<{ report_date?: string, profit_day?: unknown }>} monthDays
 * @param {string} startIso
 * @param {string} endIso
 */
export function sumFactRubInRange(monthDays, startIso, endIso) {
  const a = String(startIso ?? '').slice(0, 10)
  const b = String(endIso ?? '').slice(0, 10)
  if (!a || !b) return 0
  let sum = 0
  for (const row of monthDays ?? []) {
    const d = String(row?.report_date ?? '').slice(0, 10)
    if (!d || d < a || d > b) continue
    const n = parseSalesMoney(row?.profit_day)
    if (!Number.isNaN(n)) sum += n
  }
  return roundPlanRub(sum)
}

/**
 * Доли НК/УК из пакета top-up (по суммам ячеек).
 * @param {object|null|undefined} pack
 */
export function packNkUkShares(pack) {
  let nk = 0
  let uk = 0
  for (const h of ['pz', 'tz', 'az']) {
    nk += Number(pack?.byHall?.[h]?.nk) || 0
    uk += Number(pack?.byHall?.[h]?.uk) || 0
  }
  nk = roundPlanRub(nk)
  uk = roundPlanRub(uk)
  const den = nk + uk
  if (!(den > 0)) return { nkShare: 0.5, ukShare: 0.5, nkTotal: 0, ukTotal: 0 }
  return { nkShare: nk / den, ukShare: uk / den, nkTotal: nk, ukTotal: uk }
}

/**
 * Индекс текущей недели (или последней, если сегодня после месяца; 0 если до месяца).
 * @param {ReturnType<typeof buildMonthWeekBuckets>} weeks
 * @param {string} todayIso
 */
export function resolveActiveWeekIndex(weeks, todayIso) {
  if (!weeks?.length) return 0
  const today = String(todayIso ?? '').slice(0, 10)
  if (!today) return 0
  if (today < weeks[0].startIso) return 0
  if (today > weeks[weeks.length - 1].endIso) return weeks.length - 1
  const i = weeks.findIndex((w) => isoInWeek(today, w))
  return i >= 0 ? i : 0
}

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   todayIso?: string,
 *   packTotal: number,
 *   pack?: object|null,
 *   endingRows?: object[],
 *   monthDays?: object[],
 * }} input
 */
export function buildStrategyPlaybook(input) {
  const year = Number(input?.year)
  const month = Number(input?.month)
  const weeks = buildMonthWeekBuckets(year, month)
  if (!weeks.length) {
    return { ok: false, error: 'Некорректный месяц плана' }
  }

  const packTotal = roundPlanRub(
    Math.max(
      0,
      Number(input?.packTotal) ||
        Number(input?.pack?.totalAmount) ||
        Number(input?.pack?.budget) ||
        0,
    ),
  )
  if (!(packTotal > 0)) {
    return { ok: false, error: 'Сначала посчитайте пакет месяца' }
  }

  const endingRows = input?.endingRows ?? []
  const buckets = bucketEndingsByWeek(endingRows, weeks)
  // Темп недель — только открытые закрытия (галочки не перекашивают цели).
  const openCounts = buckets.map((b) => b.filter((r) => !r.confirmed).length)
  const weekTargets = paceWeekTargets(packTotal, weeks, openCounts)
  const shares = packNkUkShares(input?.pack)
  const todayIso = String(input?.todayIso ?? '').slice(0, 10)
  const activeIndex = resolveActiveWeekIndex(weeks, todayIso)
  const monthStart = weeks[0].startIso
  const monthEnd = weeks[weeks.length - 1].endIso
  const monthFact = sumFactRubInRange(input?.monthDays, monthStart, monthEnd)
  const monthProgress = weekProgress(monthFact, packTotal)

  /** @type {object[]} */
  const weekCards = weeks.map((w, i) => {
    const endings = buckets[i]
    const openEndings = endings.filter((r) => !r.confirmed)
    const confirmedCount = endings.length - openEndings.length
    const dkAmount = roundPlanRub(
      openEndings.reduce((a, r) => a + (Number(r.amount) || 0), 0),
    )
    const target = weekTargets[i] || 0
    const rem = roundPlanRub(Math.max(0, target - dkAmount))
    const nkOrient = roundPlanRub(rem * shares.nkShare)
    const ukOrient = roundPlanRub(rem - nkOrient)
    const fact = sumFactRubInRange(input?.monthDays, w.startIso, w.endIso)
    const progress = weekProgress(fact, target)
    const isPast = todayIso && todayIso > w.endIso
    const isCurrent = i === activeIndex
    return {
      ...w,
      targetRub: target,
      dkAmount,
      nkOrient,
      ukOrient,
      endingsCount: openEndings.length,
      endingsOpenCount: openEndings.length,
      endingsConfirmedCount: confirmedCount,
      endings,
      progress,
      isPast: Boolean(isPast),
      isCurrent,
      dkOverTarget: dkAmount > target + 0.01,
    }
  })

  const endingsOpenTotal = endingRows.filter((r) => !r.confirmed).length
  const endingsConfirmedTotal = endingRows.filter((r) => r.confirmed).length

  return {
    ok: true,
    year,
    month,
    packTotal,
    weeks: weekCards,
    activeIndex,
    monthProgress,
    shares,
    endingsTotal: endingRows.length,
    endingsOpenTotal,
    endingsConfirmedTotal,
  }
}
