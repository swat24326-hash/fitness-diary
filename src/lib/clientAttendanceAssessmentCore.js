/**
 * Текстовая оценка посещаемости для вкладки «Статистика → Посещаемость».
 * Чистая логика без React/IDB.
 */

import { formatDateRu } from './dateRu.js'
import { attendanceRegularityLabelRu } from './clientAttendanceStatsCore.js'
import {
  ATTENDANCE_TARGET_VISITS_PER_WEEK_DEFAULT,
  attendanceTrendLabelRu,
  buildMembershipAttendancePace,
  countBzVisitsShareInPeriod,
  daysSinceLastCompletedVisit,
  formatAttendanceBucketUnitsRu,
  formatAttendancePeriodLabelRu,
  formatDaysSinceRu,
  formatTrainingsCountRu,
  hasTornRhythmInLastWeekBuckets,
  resolveAttendanceTargetVisitsPerWeek,
  resolveAttendanceTrendFromBuckets,
  tornRhythmLabelRu,
} from './clientAttendanceGlanceCore.js'
import { pickUsableTypedMembershipForDate } from './membershipRules.js'

/** @typedef {import('./clientAttendanceStatsCore.js').AttendanceRegularity} AttendanceRegularity */
/** @typedef {'good' | 'warn' | 'bad'} AttendanceFactorTone */

/**
 * @typedef {{
 *   key: string,
 *   tone: AttendanceFactorTone,
 *   labelRu: string,
 *   ariaLabelRu?: string,
 * }} AttendanceAssessmentFactor
 */

/**
 * @typedef {{
 *   regularity: AttendanceRegularity,
 *   regularityLabelRu: string,
 *   periodLabelRu: string,
 *   disclaimerRu: string | null,
 *   todayLineRu: string | null,
 *   headlineRu: string,
 *   trendLabelRu: string | null,
 *   membershipLineRu: string | null,
 *   factors: AttendanceAssessmentFactor[],
 *   recommendationRu: string,
 *   dataReliable: boolean,
 * }} AttendanceAssessment
 */

export { ATTENDANCE_TARGET_VISITS_PER_WEEK_DEFAULT as ATTENDANCE_TARGET_VISITS_PER_WEEK }

function daysRu(n) {
  return formatDaysSinceRu(n)
}

function factor(tone, key, labelRu) {
  const prefix = tone === 'good' ? 'Хорошо' : tone === 'warn' ? 'Внимание' : 'Риск'
  return { key, tone, labelRu, ariaLabelRu: `${prefix}: ${labelRu}` }
}

function trailingMissedBucketCount(buckets) {
  let n = 0
  for (let i = (buckets ?? []).length - 1; i >= 0; i--) {
    if (buckets[i]?.visited) break
    n++
  }
  return n
}

function buildRecommendationRu(audience, regularity) {
  if (regularity === 'none') {
    return audience === 'sales'
      ? 'Уточнить планы клиента и предложить запись на ближайшую тренировку.'
      : 'Уточнить у клиента планы и назначить ближайшую тренировку.'
  }
  if (regularity === 'insufficient') {
    return 'Выберите более длинный период или «За всё время».'
  }
  if (regularity === 'regular') {
    return audience === 'sales'
      ? 'Темп хороший — закрепить регулярность при продлении или допродажах.'
      : 'Темп хороший — закрепить график на следующих тренировках.'
  }
  if (regularity === 'moderate') {
    return audience === 'sales'
      ? 'Норма есть (≥1/нед). Можно предложить шаг к 2 разам в неделю при продлении.'
      : 'Норма есть (≥1 раз в неделю). Предложить стабильные 2 дня в неделю и отметить в ДЗ.'
  }
  return audience === 'sales'
    ? 'Связаться с клиентом: выяснить причину пропусков и вернуть в график.'
    : 'Связаться с клиентом: согласовать график или причину пропусков.'
}

function buildDisclaimerRu(dataReliable, coverageHint) {
  if (coverageHint) return coverageHint
  if (!dataReliable) {
    return 'Оценка по локальным данным — для полной картины нужен интернет и загрузка дневника.'
  }
  return null
}

/**
 * @param {ReturnType<import('./clientAttendanceStatsCore.js').buildClientAttendanceStats>} stats
 * @param {{
 *   dateFrom: string,
 *   dateTo: string,
 *   todayIso: string,
 *   dataReliable?: boolean,
 *   coverageHint?: string | null,
 *   audience?: 'trainer' | 'sales' | 'staff',
 *   memberships?: object[],
 *   membershipTypes?: object[],
 *   allTrainings?: object[],
 * }} opts
 * @returns {AttendanceAssessment}
 */
export function buildClientAttendanceAssessment(stats, opts = {}) {
  const summary = stats?.summary ?? {}
  const buckets = stats?.buckets ?? []
  const bucketKind = stats?.bucketKind ?? 'week'
  const dateFrom = String(opts.dateFrom ?? '').slice(0, 10)
  const dateTo = String(opts.dateTo ?? '').slice(0, 10)
  const todayIso = String(opts.todayIso ?? dateTo).slice(0, 10)
  const dataReliable = opts.dataReliable !== false
  const audience = opts.audience ?? 'trainer'
  const memberships = opts.memberships ?? []
  const membershipTypes = opts.membershipTypes ?? []
  const allTrainings = opts.allTrainings ?? []

  const regularity = /** @type {AttendanceRegularity} */ (summary.regularity ?? 'none')
  const regularityLabelRu = summary.regularityLabelRu ?? attendanceRegularityLabelRu(regularity)
  const total = Number(summary.total) || 0
  const visitsPerWeek = Number(summary.visitsPerWeek) || 0
  const maxGap = summary.maxGapDays
  const tailInPeriod = summary.daysSinceLastVisit

  const activeMembership = pickUsableTypedMembershipForDate(memberships, todayIso)
  const target = resolveAttendanceTargetVisitsPerWeek(activeMembership)
  const periodLabelRu = formatAttendancePeriodLabelRu(dateFrom, dateTo)
  const disclaimerRu = buildDisclaimerRu(dataReliable, opts.coverageHint)

  const daysSinceToday = daysSinceLastCompletedVisit(allTrainings, todayIso)
  const periodEndsToday = dateTo === todayIso
  let todayLineRu = null
  if (daysSinceToday != null) {
    if (periodEndsToday) {
      todayLineRu = `Сейчас: ${daysRu(daysSinceToday)} с последнего визита.`
    } else {
      todayLineRu = `Сейчас (на ${formatDateRu(todayIso)}): ${daysRu(daysSinceToday)} с последнего визита — период выше заканчивается ${formatDateRu(dateTo)}.`
    }
  } else if (pickUsableTypedMembershipForDate(memberships, todayIso)) {
    todayLineRu = 'Сейчас: завершённых тренировок в дневнике нет.'
  }

  const trendRaw = resolveAttendanceTrendFromBuckets(buckets, bucketKind)
  const trend =
    regularity === 'none' || regularity === 'insufficient' ? null : trendRaw
  const trendLabelRu = attendanceTrendLabelRu(trend)

  const pace = activeMembership
    ? buildMembershipAttendancePace(activeMembership, allTrainings, todayIso, target)
    : null
  let membershipLineRu = null
  if (pace) {
    membershipLineRu = `Абонемент: ${pace.used} из ${pace.total} · нужно ~${pace.neededPerWeek}/нед до конца`
    if (!pace.onTrack) membershipLineRu += ' — темп отстаёт'
  }

  if (regularity === 'none') {
    const missed = buckets.filter((b) => !b.visited).length
    /** @type {AttendanceAssessmentFactor[]} */
    const factors = []
    if (buckets.length > 0 && missed > 0) {
      factors.push(
        factor('bad', 'missed_periods', `Без визитов: ${missed} из ${buckets.length} ${bucketKind === 'month' ? 'месяцев' : 'недель'}`),
      )
    }
    return {
      regularity,
      regularityLabelRu,
      periodLabelRu,
      disclaimerRu,
      todayLineRu,
      headlineRu: `${periodLabelRu.charAt(0).toUpperCase()}${periodLabelRu.slice(1)} завершённых тренировок нет.`,
      trendLabelRu,
      membershipLineRu,
      factors,
      recommendationRu: buildRecommendationRu(audience, regularity),
      dataReliable,
    }
  }

  if (regularity === 'insufficient') {
    return {
      regularity,
      regularityLabelRu,
      periodLabelRu,
      disclaimerRu,
      todayLineRu,
      headlineRu:
        total < 2
          ? `${periodLabelRu.charAt(0).toUpperCase()}${periodLabelRu.slice(1)} мало визитов — нужна хотя бы вторая тренировка.`
          : `${periodLabelRu.charAt(0).toUpperCase()}${periodLabelRu.slice(1)} слишком короткий интервал для уверенной оценки.`,
      trendLabelRu,
      membershipLineRu,
      factors: [factor('warn', 'insufficient', `В периоде ${formatTrainingsCountRu(total)}`)],
      recommendationRu: buildRecommendationRu(audience, regularity),
      dataReliable,
    }
  }

  /** @type {AttendanceAssessmentFactor[]} */
  const factors = []

  const visitedBuckets = buckets.filter((b) => b.visited).length
  if (buckets.length > 0) {
    const ratio = visitedBuckets / buckets.length
    const label = `${visitedBuckets} из ${buckets.length} ${bucketKind === 'month' ? 'месяцев' : 'недель'} с визитом`
    factors.push(factor(ratio >= 0.7 ? 'good' : ratio >= 0.4 ? 'warn' : 'bad', 'coverage', label))
  }

  if (visitsPerWeek >= target * 0.75) {
    factors.push(
      factor(
        visitsPerWeek >= target ? 'good' : 'warn',
        'pace',
        `~${visitsPerWeek} тренировок в неделю (цель — около ${target})`,
      ),
    )
  } else {
    factors.push(factor('bad', 'pace', `~${visitsPerWeek} тренировок в неделю — ниже цели ${target}`))
  }

  if (pace && !pace.onTrack) {
    factors.push(
      factor('warn', 'abon_pace', `По абону нужно ~${pace.neededPerWeek}/нед, осталось ${pace.remaining} из ${pace.total}`),
    )
  }

  if (maxGap != null) {
    if (maxGap <= 10) factors.push(factor('good', 'max_gap', `Макс. перерыв ${daysRu(maxGap)} — короткий`))
    else if (maxGap <= 14) factors.push(factor('warn', 'max_gap', `Был перерыв ${daysRu(maxGap)}`))
    else factors.push(factor('bad', 'max_gap', `Длинный перерыв ${daysRu(maxGap)}`))
  }

  if (tailInPeriod != null && !periodEndsToday) {
    factors.push(
      factor(
        tailInPeriod <= 7 ? 'good' : tailInPeriod <= 14 ? 'warn' : 'bad',
        'tail_period',
        `До конца периода (${formatDateRu(dateTo)}): ${daysRu(tailInPeriod)} с последнего визита в периоде`,
      ),
    )
  } else if (tailInPeriod != null) {
    if (tailInPeriod <= 7) factors.push(factor('good', 'tail', `Последний визит ${daysRu(tailInPeriod)} назад — недавно`))
    else if (tailInPeriod <= 14) factors.push(factor('warn', 'tail', `С последнего визита ${daysRu(tailInPeriod)}`))
    else factors.push(factor('bad', 'tail', `Давно не был: ${daysRu(tailInPeriod)} с последнего визита`))
  }

  const trailingMissed = trailingMissedBucketCount(buckets)
  if (trailingMissed >= 2) {
    factors.push(
      factor('bad', 'trailing_miss', `Подряд без визита: ${formatAttendanceBucketUnitsRu(trailingMissed, bucketKind)}`),
    )
  }

  const last8 = bucketKind === 'week' ? buckets.slice(-8) : []
  const torn = hasTornRhythmInLastWeekBuckets(last8, bucketKind, 8)
  const tornLabel = torn ? tornRhythmLabelRu(last8, bucketKind, 8) : null

  if (torn && tornLabel) {
    factors.push(factor('warn', 'trend', tornLabel))
  } else if (trend === 'improving') {
    factors.push(factor('good', 'trend', 'За последние 4 недели — больше визитов, чем в предыдущие 4'))
  } else if (trend === 'slipping') {
    factors.push(factor('bad', 'trend', 'За последние 4 недели — меньше визитов, чем в предыдущие 4'))
  } else if (trend === 'stable') {
    factors.push(factor('good', 'trend', 'Последние 8 недель — ровный объём без длинных пауз'))
  }

  const bzShare = countBzVisitsShareInPeriod(allTrainings, memberships, membershipTypes, dateFrom, dateTo)
  if (bzShare && bzShare.share >= 0.5 && activeMembership && pace) {
    factors.push(
      factor(
        'warn',
        'bz_share',
        `Больше половины визитов (${bzShare.bz} из ${bzShare.total}) — пробные БЗ; paid-абон используется слабо`,
      ),
    )
  }

  const tailPhrase =
    periodEndsToday && tailInPeriod != null
      ? tailInPeriod <= 7
        ? ' Последний визит недавно.'
        : ` С последнего визита в периоде — ${daysRu(tailInPeriod)}.`
      : ''

  let headlineRu = ''
  if (regularity === 'regular') {
    headlineRu = `${periodLabelRu.charAt(0).toUpperCase()}${periodLabelRu.slice(1)} ~${visitsPerWeek} тренировок в неделю — близко к цели ${target}.${tailPhrase}`
  } else if (regularity === 'moderate') {
    const gapNote =
      maxGap != null && maxGap > 14
        ? `, есть длинный перерыв (${daysRu(maxGap)})`
        : maxGap != null && maxGap > 10
          ? ', были заметные паузы'
          : ''
    headlineRu = `${periodLabelRu.charAt(0).toUpperCase()}${periodLabelRu.slice(1)} ~${visitsPerWeek} тренировок в неделю — норма (≥1/нед)${gapNote}.${tailPhrase}`
  } else {
    headlineRu = `${periodLabelRu.charAt(0).toUpperCase()}${periodLabelRu.slice(1)} ~${visitsPerWeek} тренировок в неделю — редкие визиты или длинные перерывы.${tailPhrase}`
  }

  const priority = ['abon_pace', 'trailing_miss', 'trend', 'tail', 'tail_period', 'max_gap', 'pace', 'coverage', 'bz_share']
  const sorted = [...factors].sort((a, b) => {
    const ia = priority.indexOf(a.key)
    const ib = priority.indexOf(b.key)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  return {
    regularity,
    regularityLabelRu,
    periodLabelRu,
    disclaimerRu,
    todayLineRu,
    headlineRu,
    trendLabelRu,
    membershipLineRu,
    factors: sorted.slice(0, 6),
    recommendationRu: buildRecommendationRu(audience, regularity),
    dataReliable,
  }
}
