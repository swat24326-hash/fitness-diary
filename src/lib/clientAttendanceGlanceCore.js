/**
 * Посещаемость: glance, фильтр «выпали из ритма», общие правила для оценки.
 * Чистая логика без React/IDB.
 */

import { addDaysToIso, formatDateRu } from './dateRu.js'
import {
  buildClientAttendanceStats,
  daysInIsoRangeInclusive,
  listCompletedVisitDates,
  maxGapDaysInPeriod,
} from './clientAttendanceStatsCore.js'
import {
  countedUsedTrainingsOnMembership,
  isCalendarUnlimitedMembership,
  pickUsableMembershipForDate,
  resolveMembershipForDiaryTraining,
} from './membershipRules.js'
import { isPnkTrialTypeRow } from './pnk/pnkTrialTrainingCore.js'
import { daysSinceIsoDate, daysWordRu } from './trainer/trainerClientOutreachCore.js'

/** @typedef {import('./clientAttendanceStatsCore.js').AttendanceRegularity} AttendanceRegularity */
/** @typedef {import('./clientAttendanceStatsCore.js').AttendanceBucketKind} AttendanceBucketKind */
/** @typedef {'improving' | 'stable' | 'slipping'} AttendanceTrendKind */

export const ATTENDANCE_SLIP_DAYS_THRESHOLD = 14
export const ATTENDANCE_GLANCE_WINDOW_DAYS = 30
export const ATTENDANCE_TARGET_VISITS_PER_WEEK_DEFAULT = 2

/** @param {number} n */
export function formatTrainingsCountRu(n) {
  const x = Math.abs(Number(n)) || 0
  const mod10 = x % 10
  const mod100 = x % 100
  if (mod10 === 1 && mod100 !== 11) return `${x} тренировка`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${x} тренировки`
  return `${x} тренировок`
}

/**
 * @param {number} n
 * @param {AttendanceBucketKind} kind
 */
export function formatAttendanceBucketUnitsRu(n, kind) {
  const x = Math.abs(Number(n)) || 0
  const mod10 = x % 10
  const mod100 = x % 100
  if (kind === 'month') {
    if (mod10 === 1 && mod100 !== 11) return `${x} месяц`
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${x} месяца`
    return `${x} месяцев`
  }
  if (mod10 === 1 && mod100 !== 11) return `${x} неделя`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${x} недели`
  return `${x} недель`
}

/**
 * @param {string} dateFrom
 * @param {string} dateTo
 */
export function formatAttendancePeriodLabelRu(dateFrom, dateTo) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!from || !to) return 'за выбранный период'
  return `за период ${formatDateRu(from)} — ${formatDateRu(to)}`
}

/**
 * @param {object | null | undefined} membership
 */
export function resolveAttendanceTargetVisitsPerWeek(membership) {
  const fallback = ATTENDANCE_TARGET_VISITS_PER_WEEK_DEFAULT
  if (!membership || isCalendarUnlimitedMembership(membership)) return fallback
  const total = Number(membership.total_trainings)
  if (!Number.isFinite(total) || total <= 0) return fallback
  const days = daysInIsoRangeInclusive(membership.start_date, membership.end_date)
  if (days <= 0) return fallback
  const weeks = Math.max(1, Math.ceil(days / 7))
  const pace = Math.round((total / weeks) * 10) / 10
  return Math.min(5, Math.max(0.5, pace))
}

/**
 * @param {object[]} trainings
 * @returns {string | null}
 */
export function resolveLastCompletedVisitDate(trainings) {
  const visits = listCompletedVisitDates(trainings)
  return visits.length ? visits[visits.length - 1].date : null
}

/**
 * @param {object[]} trainings
 * @param {string} todayIso
 * @returns {number | null}
 */
export function daysSinceLastCompletedVisit(trainings, todayIso) {
  const last = resolveLastCompletedVisitDate(trainings)
  if (!last) return null
  const gap = daysSinceIsoDate(last, todayIso)
  return gap != null && gap >= 0 ? gap : null
}

/**
 * @param {number | null | undefined} n
 */
export function formatDaysSinceRu(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x < 0) return '—'
  return `${x} ${daysWordRu(x)}`
}

/**
 * @param {Array<{ count?: number, visited?: boolean }>} buckets
 * @returns {number}
 */
export function maxConsecutiveMissedBuckets(buckets) {
  let max = 0
  let run = 0
  for (const b of buckets ?? []) {
    const missed = b?.visited === false || (Number(b?.count) || 0) <= 0
    if (missed) {
      run++
      if (run > max) max = run
    } else {
      run = 0
    }
  }
  return max
}

/**
 * @param {Array<{ start?: string, end?: string, count?: number, visited?: boolean, dates?: string[] }>} buckets
 * @param {number} [weekCount]
 * @returns {number | null}
 */
export function maxGapDaysInLastWeekBuckets(buckets, weekCount = 8) {
  const last = (buckets ?? []).slice(-weekCount)
  if (last.length < weekCount) return null
  const start = String(last[0]?.start ?? '').slice(0, 10)
  const end = String(last[last.length - 1]?.end ?? '').slice(0, 10)
  if (!start || !end) return null
  const dates = last
    .flatMap((b) => b?.dates ?? [])
    .map((d) => String(d).slice(0, 10))
    .filter(Boolean)
    .sort()
  if (!dates.length) return null
  return maxGapDaysInPeriod(start, end, dates)
}

/**
 * Короткие обрезки периода (начало/конец) не считаем полноценной «пустой неделей».
 * @param {{ start?: string, end?: string }} bucket
 */
function isCountableWeekBucketForRhythm(bucket) {
  const start = String(bucket?.start ?? '').slice(0, 10)
  const end = String(bucket?.end ?? '').slice(0, 10)
  if (!start || !end) return true
  return daysInIsoRangeInclusive(start, end) >= 4
}

/**
 * @param {Array<{ start?: string, end?: string, count?: number, visited?: boolean }>} buckets
 */
function countableMissedWeekBuckets(buckets) {
  return (buckets ?? []).filter(
    (b) =>
      isCountableWeekBucketForRhythm(b) &&
      (b?.visited === false || (Number(b?.count) || 0) <= 0),
  )
}

/**
 * Разорванный ритм за последние N недель: ≥14 дн. без визита, 2+ пустых недели
 * или 2+ недели подряд без визита.
 * @param {Array<{ start?: string, end?: string, count?: number, visited?: boolean, dates?: string[] }>} buckets
 * @param {AttendanceBucketKind} [bucketKind]
 * @param {number} [weekCount]
 */
export function hasTornRhythmInLastWeekBuckets(buckets, bucketKind = 'week', weekCount = 8) {
  if (bucketKind !== 'week') return false
  const last = (buckets ?? []).slice(-weekCount)
  if (last.length < weekCount) return false

  const countable = last.filter(isCountableWeekBucketForRhythm)
  const missRun = maxConsecutiveMissedBuckets(countable)
  if (missRun >= 2) return true

  if (countableMissedWeekBuckets(last).length >= 2) return true

  const gap = maxGapDaysInLastWeekBuckets(last, weekCount)
  if (gap != null && gap >= ATTENDANCE_SLIP_DAYS_THRESHOLD) return true

  return false
}

/**
 * @param {Array<{ start?: string, end?: string, count?: number, visited?: boolean, dates?: string[] }>} buckets
 * @param {AttendanceBucketKind} [bucketKind]
 * @param {number} [weekCount]
 */
export function tornRhythmLabelRu(buckets, bucketKind = 'week', weekCount = 8) {
  if (bucketKind !== 'week') return null
  const last = (buckets ?? []).slice(-weekCount)
  if (last.length < weekCount) return null

  const countable = last.filter(isCountableWeekBucketForRhythm)
  const missRun = maxConsecutiveMissedBuckets(countable)
  if (missRun >= 2) {
    return `Разорванный ритм: ${formatAttendanceBucketUnitsRu(missRun, 'week')} подряд без визита`
  }

  const missedWeeks = countableMissedWeekBuckets(last).length
  if (missedWeeks >= 2) {
    return `Разорванный ритм: ${missedWeeks} из ${weekCount} недель без визита`
  }

  const gap = maxGapDaysInLastWeekBuckets(last, weekCount)
  if (gap != null && gap >= ATTENDANCE_SLIP_DAYS_THRESHOLD) {
    return `Разорванный ритм: перерыв ${formatDaysSinceRu(gap)} за последние ${weekCount} недель`
  }

  return null
}

/**
 * @param {Array<{ count?: number }>} buckets
 * @param {AttendanceBucketKind} bucketKind
 * @returns {AttendanceTrendKind | null}
 */
export function resolveAttendanceTrendFromBuckets(buckets, bucketKind) {
  if (bucketKind !== 'week') return null
  const list = buckets ?? []
  if (list.length < 8) return null
  const tail = list.slice(-4)
  const prev = list.slice(-8, -4)
  const recent = tail.reduce((s, b) => s + (Number(b?.count) || 0), 0)
  const before = prev.reduce((s, b) => s + (Number(b?.count) || 0), 0)
  // Нет визитов в обеих половинах — это не «ровный объём».
  if (recent === 0 && before === 0) return null
  if (recent > before * 1.15) return 'improving'
  if (recent < before * 0.85) return 'slipping'
  return 'stable'
}

/** @param {AttendanceTrendKind | null} kind */
export function attendanceTrendLabelRu(kind) {
  if (kind === 'improving') return 'Улучшается'
  if (kind === 'slipping') return 'Проседает'
  if (kind === 'stable') return 'Ровный объём'
  return null
}

/**
 * @param {object | null | undefined} membership
 * @param {object[]} trainings
 * @param {string} todayIso
 * @param {number} [targetVisitsPerWeek]
 */
export function buildMembershipAttendancePace(membership, trainings, todayIso, targetVisitsPerWeek) {
  if (!membership || isCalendarUnlimitedMembership(membership)) return null
  const total = Number(membership.total_trainings)
  if (!Number.isFinite(total) || total <= 0) return null
  const used = countedUsedTrainingsOnMembership(membership, trainings ?? [])
  const remaining = Math.max(0, total - used)
  const end = String(membership.end_date ?? '').slice(0, 10)
  const today = String(todayIso ?? '').slice(0, 10)
  const daysLeft = end && today && end >= today ? (daysSinceIsoDate(today, end) ?? 0) + 1 : 0
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7))
  const neededPerWeek = Math.round((remaining / weeksLeft) * 10) / 10
  const target = Number(targetVisitsPerWeek) || resolveAttendanceTargetVisitsPerWeek(membership)
  return {
    used,
    total,
    remaining,
    daysLeft,
    neededPerWeek,
    target,
    onTrack: neededPerWeek <= target + 0.2,
  }
}

/**
 * @param {object[]} trainings
 * @param {object[]} memberships
 * @param {object[]} membershipTypes
 * @param {string} dateFrom
 * @param {string} dateTo
 */
export function countBzVisitsShareInPeriod(trainings, memberships, membershipTypes, dateFrom, dateTo) {
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  const typeById = new Map((membershipTypes ?? []).map((t) => [String(t.id), t]))
  let total = 0
  let bz = 0
  for (const t of trainings ?? []) {
    if (String(t?.status ?? '').toLowerCase() !== 'completed') continue
    const d = String(t?.date ?? '').slice(0, 10)
    if (!d || d < from || d > to) continue
    total++
    const mem = resolveMembershipForDiaryTraining(t, d, memberships ?? [])
    const type = mem ? typeById.get(String(mem.membership_type_id ?? '')) : null
    if (type && isPnkTrialTypeRow(type)) bz++
  }
  if (total <= 0) return null
  return { total, bz, share: bz / total }
}

/**
 * @param {{
 *   client?: object | null,
 *   memList?: object[],
 *   today?: string,
 *   hallMode?: string,
 *   lastTrainingIso?: string | null,
 *   trainings?: object[],
 * }} params
 */
export function isClientAttendanceSlip(params = {}) {
  const client = params.client
  if (client?.archived_at) return false
  if (String(client?.lifecycle ?? '') === 'pnk') return false
  const hall = String(params.hallMode ?? 'pz').toLowerCase()
  if (hall !== 'pz') return false

  const today = String(params.today ?? '').slice(0, 10)
  const memList = params.memList ?? []
  if (!pickUsableMembershipForDate(memList, today)) return false

  const trainingsProvided = Array.isArray(params.trainings)
  const lastIsoProvided = Object.prototype.hasOwnProperty.call(params, 'lastTrainingIso')
  const trainings = trainingsProvided ? params.trainings : []
  const lastFromTrainings = resolveLastCompletedVisitDate(trainings)

  let last = null
  if (lastIsoProvided) {
    const s = String(params.lastTrainingIso ?? '').slice(0, 10)
    last = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
  } else if (lastFromTrainings) {
    last = lastFromTrainings
  }

  // Нет ни даты, ни списка тренировок — данные ещё не подгружены; не считаем выпадением.
  if (!lastIsoProvided && !trainingsProvided) return false

  if (!last) return true

  const days = daysSinceIsoDate(last, today)
  // Выпадение = долгая пауза без визита (≥14 дн.). Низкая средняя («Редко») сама по себе
  // не выпадение, если клиент недавно ходил — это уже оценка «Редко», не slip.
  if (days != null && days >= ATTENDANCE_SLIP_DAYS_THRESHOLD) return true
  return false
}

/**
 * @param {AttendanceRegularity} regularity
 * @param {number | null} daysSince
 */
export function resolveAttendanceGlanceTone(regularity, daysSince) {
  if (daysSince != null && daysSince >= ATTENDANCE_SLIP_DAYS_THRESHOLD) return 'bad'
  if (regularity === 'regular' || regularity === 'moderate') return 'good'
  if (regularity === 'insufficient') return 'warn'
  if (regularity === 'rare' || regularity === 'none') return 'bad'
  return 'warn'
}

/**
 * @param {{
 *   client?: object | null,
 *   trainings?: object[],
 *   memList?: object[],
 *   today?: string,
 * }} params
 */
export function buildClientAttendanceGlance(params = {}) {
  const today = String(params.today ?? '').slice(0, 10)
  const trainings = params.trainings ?? []
  const memList = params.memList ?? []
  const client = params.client ?? null
  const active = pickUsableMembershipForDate(memList, today)
  if (!active) return null

  const dateFrom = addDaysToIso(today, -(ATTENDANCE_GLANCE_WINDOW_DAYS - 1))
  const stats = buildClientAttendanceStats(trainings, { dateFrom, dateTo: today })
  const daysSince = daysSinceLastCompletedVisit(trainings, today)
  const regularity = stats.summary.regularity
  const tone = resolveAttendanceGlanceTone(regularity, daysSince)
  const rhythm = stats.summary.regularityLabelRu
  const daysPart = daysSince != null ? `${daysSince} дн.` : 'нет визитов'
  const slip = isClientAttendanceSlip({
    client,
    memList,
    today,
    trainings,
    hallMode: 'pz',
  })
  return {
    regularity,
    regularityLabelRu: rhythm,
    daysSinceLastVisit: daysSince,
    tone,
    // При выпадении не пишем «Норма · 19 дн.» — это конфликт сигналов.
    chipLabelRu: slip
      ? daysSince != null
        ? `Пауза · ${daysSince} дн.`
        : 'Пауза · нет визитов'
      : `${rhythm} · ${daysPart}`,
    slip,
  }
}

/**
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 * @param {Record<string, string>} [lastTrainingByClient]
 * @param {Record<string, object[]>} [trainingsByClientId]
 */
export function countClientsAttendanceSlip(
  clients,
  memByClient,
  today,
  lastTrainingByClient = {},
  trainingsByClientId = {},
) {
  let n = 0
  for (const c of clients ?? []) {
    const id = String(c?.id ?? '')
    if (!id) continue
    const memList = memByClient[id] ?? memByClient[c.id] ?? []
    const hasLast = Object.prototype.hasOwnProperty.call(lastTrainingByClient ?? {}, id)
    const hasTrainings = Object.prototype.hasOwnProperty.call(trainingsByClientId ?? {}, id)
    if (
      isClientAttendanceSlip({
        client: c,
        memList,
        today,
        hallMode: 'pz',
        ...(hasLast ? { lastTrainingIso: lastTrainingByClient[id] } : {}),
        ...(hasTrainings ? { trainings: trainingsByClientId[id] } : {}),
      })
    ) {
      n++
    }
  }
  return n
}
