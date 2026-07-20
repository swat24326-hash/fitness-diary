/**
 * Единый слой аналитики месяца клуба.
 * Все цифры и выводы считаются здесь — Gemini и chips только читают JSON.
 */

import {
  computeNetProfit,
  monthDateRange,
  readPlanLevels,
  resolvePlanFactFromMonthSummary,
  resolvePlanTotal,
  sumMatrixTotalsFromDailyRows,
} from './salesReportCore.js'
import { buildSalesManagerMonthStats } from './salesManagerStatsAgg.js'
import { computeNetProfitWithPayroll } from './trainerPayrollCore.js'
import { buildGeminiDataSourcesMeta } from './geminiAnalyticsDomain.js'
import {
  buildGeminiMonthCalendarContext,
  comparePlanToCalendar,
  planToneWithCalendar,
  shouldFlagLowPlan,
} from './geminiMonthCalendarContext.js'
import { buildPlanDirectionInsights } from './geminiPlanDirections.js'
import { buildIskraMonthForecastSummary, buildIskraClubFinanceBlock } from './clubFinanceForecastCore.js'

export const MONTH_LABELS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

export function periodLabelRu(year, month) {
  const m = Number(month)
  const name = MONTH_LABELS_RU[(m || 1) - 1] ?? ''
  return `${name} ${Number(year) || ''}`.trim()
}

/** @param {number} year @param {number} month 1–12 */
export function previousMonthParts(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null
  if (m <= 1) return { year: y - 1, month: 12 }
  return { year: y, month: m - 1 }
}

export const PLAN_TONE_STRONG_PCT = 90
export const PLAN_TONE_OK_PCT = 55
export const PNK_TONE_STRONG = 20
export const PNK_TONE_OK = 8
export const PAYROLL_SHARE_STRONG_PCT = 35
export const PAYROLL_SHARE_OK_PCT = 45
export const COVERAGE_WEAK_PCT = 35
export const PLAN_WEAK_PCT = 50
export const FITCITY_GAP_ISSUE = 5
export const INACTIVE_ISSUE = 5

function round1(n) {
  return Math.round(Number(n) * 10) / 10
}

function pnkTone(total) {
  if (total >= PNK_TONE_STRONG) return 'strong'
  if (total >= PNK_TONE_OK) return 'ok'
  return 'weak'
}

function payrollMarginTone(net, payrollShare) {
  if (net < 0) return 'negative'
  if (payrollShare <= PAYROLL_SHARE_STRONG_PCT) return 'strong'
  if (payrollShare <= PAYROLL_SHARE_OK_PCT) return 'ok'
  return 'weak'
}

/** @param {Array<{ date: string, profit: number | null, hasReport: boolean }>} series */
function profitDayHighlightsFromSeries(series) {
  const reported = (series ?? []).filter((d) => d.hasReport && d.profit != null)
  if (!reported.length) return null

  let best = reported[0]
  let worst = reported[0]
  for (const day of reported) {
    if (day.profit > best.profit) best = day
    if (day.profit < worst.profit) worst = day
  }

  return {
    best_day: { date: best.date, profit: best.profit },
    worst_reported_day: { date: worst.date, profit: worst.profit },
  }
}

/** @param {Array<{ date: string, value: number | null, hasReport: boolean }>} series */
function maxCountDayFromSeries(series) {
  const reported = (series ?? []).filter((d) => d.hasReport && d.value != null)
  if (!reported.length) return null
  let max = reported[0]
  for (const day of reported) {
    if (day.value > max.value) max = day
  }
  return { date: max.date, value: max.value }
}

function fitcityStatus(managerTotal, fitCityTotal) {
  const gap = managerTotal - fitCityTotal
  if (managerTotal <= 0 && fitCityTotal <= 0) return 'empty'
  if (gap === 0) return 'aligned'
  if (gap > 0) return 'manager_higher'
  return 'fitcity_higher'
}

/**
 * @param {{
 *   stats: ReturnType<typeof buildSalesManagerMonthStats>,
 *   managerTrainingsTotal: number,
 *   fitCityCompleted: number,
 *   inactiveInPeriod: number,
 *   finance?: object | null,
 *   includeFinance?: boolean,
 *   calendarContext?: ReturnType<typeof buildGeminiMonthCalendarContext> | null,
 * }} opts
 */
export function buildClubMonthInsights(opts) {
  const stats = opts.stats
  const summary = stats.summary
  const profitTotal = summary.profitTotal || 0
  const planPct = stats.plan.progressPercent
  const planTotal = stats.plan.finalTarget
  const pnkTotal = summary.pnkTotal
  const dayCount = summary.dayCount
  const daysInMonth = summary.daysInMonth
  const coveragePct = daysInMonth > 0 ? round1((dayCount / daysInMonth) * 100) : 0
  const calendarContext = opts.calendarContext ?? null
  const managerTotal = Number(opts.managerTrainingsTotal) || 0
  const fitCityTotal = Number(opts.fitCityCompleted) || 0
  const gap = managerTotal - fitCityTotal
  const inactive = Number(opts.inactiveInPeriod) || 0

  const nk = stats.structure.find((s) => s.key === 'nk')
  const dk = stats.structure.find((s) => s.key === 'dk')
  const uk = stats.structure.find((s) => s.key === 'uk')
  const dopCat = stats.structure.find((s) => s.key === 'dop')
  const weakNkVsDk =
    profitTotal > 0 &&
    (Number(nk?.amount) || 0) / profitTotal < 0.15 &&
    (Number(dk?.amount) || 0) / profitTotal > 0.55

  /** @type {Array<{ id: string, weight: number, text: string }>} */
  const issues = []
  if (planTotal > 0 && shouldFlagLowPlan(planPct, planTotal, calendarContext)) {
    const vsCalendar = comparePlanToCalendar(planPct, calendarContext)
    const expected = calendarContext?.expected_plan_progress_pct
    const text =
      calendarContext?.month_relation === 'current' && vsCalendar === 'behind' && expected != null
        ? `план ${planPct}% при ориентире ~${expected}% к дате — отставание`
        : `план продаж ${planPct}% — просадка`
    issues.push({
      id: 'low_plan',
      weight: 50 - planPct,
      text,
    })
  }
  if (inactive >= INACTIVE_ISSUE) {
    issues.push({
      id: 'inactive_clients',
      weight: inactive,
      text: `${inactive} неактивных клиентов в периоде`,
    })
  }
  if (weakNkVsDk) {
    issues.push({
      id: 'weak_nk',
      weight: 30,
      text: 'слабая доля НК при опоре на ДК — просадка по новым',
    })
  }
  issues.sort((a, b) => b.weight - a.weight)

  const profitHighlights = profitDayHighlightsFromSeries(stats.dailySeries)
  const maxPnkDay = maxCountDayFromSeries(stats.dailyPnkSeries)
  const maxTrainingsDay = maxCountDayFromSeries(stats.dailyTrainingsSeries)

  /** @type {Record<string, unknown>} */
  const insights = {
    plan: {
      pct: planPct,
      tone: planToneWithCalendar(planPct, calendarContext),
      achieved_level: stats.plan.achievedLevel,
      has_plan: planTotal > 0,
      profit_total: profitTotal,
      profit_gross_for_plan: resolvePlanFactFromMonthSummary(summary),
      refunds_total: summary.refundsTotal ?? 0,
      plan_total: planTotal,
      calendar_expected_pct: calendarContext?.expected_plan_progress_pct ?? null,
      calendar_vs_plan: comparePlanToCalendar(planPct, calendarContext),
    },
    pnk: {
      total: pnkTotal,
      tone: pnkTone(pnkTotal),
      max_day: maxPnkDay,
    },
    structure: {
      nk_share_pct: nk?.sharePercent ?? 0,
      dk_share_pct: dk?.sharePercent ?? 0,
      uk_share_pct: uk?.sharePercent ?? 0,
      dop_share_pct: dopCat?.sharePercent ?? 0,
      weak_nk_vs_dk: weakNkVsDk,
      rows: stats.structure,
      direction_rows: stats.directionStructure ?? [],
    },
    direction_plan: buildPlanDirectionInsights(stats.directionStructure ?? [], calendarContext),
    fitcity: {
      manager_total: managerTotal,
      fit_city_total: fitCityTotal,
      gap,
      status: fitcityStatus(managerTotal, fitCityTotal),
    },
    issues,
    has_critical_issues: issues.length > 0,
    top_issue: issues[0] ?? null,
    highlights: {
      ...profitHighlights,
      max_pnk_day: maxPnkDay,
      max_trainings_day: maxTrainingsDay,
      max_day_profit: stats.maxDayProfit,
      max_day_pnk: stats.maxDayPnk,
      max_day_trainings: stats.maxDayTrainings,
    },
    report: {
      days_with_reports: dayCount,
      days_in_month: daysInMonth,
      coverage_pct: coveragePct,
      avg_profit_per_report_day:
        dayCount > 0 ? Math.round((profitTotal / dayCount) * 100) / 100 : 0,
      calendar_phase: calendarContext?.phase_label_ru ?? null,
      calendar_day: calendarContext?.calendar_day ?? null,
      calendar_days_remaining: calendarContext?.days_remaining ?? null,
      calendar_month_relation: calendarContext?.month_relation ?? null,
    },
    payroll: {
      trainer_total: summary.trainerPayroll,
      aerobic_total: summary.aerobicPayroll,
    },
    mom_comparison: null,
  }

  const includeFinance = opts.includeFinance !== false
  const finance = opts.finance
  if (includeFinance && finance) {
    const gross = Number(finance.gross_before_expense) || profitTotal
    const trainerPayroll = Number(finance.trainer_payroll) || 0
    const aerobicPayroll = Number(finance.aerobic_payroll) || 0
    const net = Number(finance.net_profit) || 0
    const payrollShare = gross > 0 ? round1((trainerPayroll / gross) * 100) : 0
    const aerobicShare = gross > 0 ? round1((aerobicPayroll / gross) * 100) : 0

    insights.finance = {
      net_profit: net,
      trainer_payroll: trainerPayroll,
      aerobic_payroll: aerobicPayroll,
      supervisor_expense: Number(finance.supervisor_expense) || 0,
      gross,
      payroll_share_pct: payrollShare,
      aerobic_payroll_share_pct: aerobicShare,
      margin_tone: payrollMarginTone(net, payrollShare),
    }
  }

  return insights
}

/**
 * 0 в сравнении с прошлым месяцем = данных нет, не «нулевой результат».
 * @param {number} value
 */
export function isMomComparisonMetricMissing(value) {
  const n = Number(value)
  return !Number.isFinite(n) || n === 0
}

/**
 * @param {number} curPlan
 * @param {number} prevPlan
 * @returns {'up'|'down'|'flat'|null}
 */
export function resolveMomPlanDirection(curPlan, prevPlan) {
  if (isMomComparisonMetricMissing(prevPlan)) return null
  const cur = Number(curPlan) || 0
  const prev = Number(prevPlan) || 0
  if (cur === prev) return 'flat'
  return cur > prev ? 'up' : 'down'
}

/**
 * @param {object} snapshot
 */
export function isMomSnapshotMonthEmpty(snapshot) {
  const days = Number(snapshot?.sales?.days_with_reports) || 0
  return days <= 0
}

/**
 * @param {object} snapshot
 * @param {object|null} previousSnapshot
 */
export function applyMonthComparisonInsights(snapshot, previousSnapshot) {
  if (!snapshot?.insights) return snapshot
  if (!previousSnapshot) {
    snapshot.insights.mom_comparison = null
    return snapshot
  }

  const curProfit = Number(snapshot.sales?.profit_total) || 0
  const prevProfit = Number(previousSnapshot.sales?.profit_total) || 0
  const curPlan = Number(snapshot.sales?.plan_progress_pct) || 0
  const prevPlan = Number(previousSnapshot.sales?.plan_progress_pct) || 0
  const prevMonthEmpty = isMomSnapshotMonthEmpty(previousSnapshot)
  const profitPreviousMissing = prevMonthEmpty || isMomComparisonMetricMissing(prevProfit)
  const planPreviousMissing = prevMonthEmpty || isMomComparisonMetricMissing(prevPlan)
  const delta = curProfit - prevProfit
  const deltaPct = profitPreviousMissing ? null : round1((delta / prevProfit) * 100)

  let profitDirection = 'flat'
  if (profitPreviousMissing) {
    profitDirection = curProfit > 0 ? 'no_previous' : 'flat'
  } else if (delta > 0) {
    profitDirection = 'up'
  } else if (delta < 0) {
    profitDirection = 'down'
  }

  snapshot.insights.mom_comparison = {
    previous_period_label: previousSnapshot.period?.label || 'прошлый месяц',
    profit_current: curProfit,
    profit_previous: prevProfit,
    profit_delta: delta,
    profit_delta_pct: deltaPct,
    profit_direction: profitDirection,
    profit_previous_missing: profitPreviousMissing,
    plan_pct_current: curPlan,
    plan_pct_previous: prevPlan,
    plan_previous_missing: planPreviousMissing,
    plan_direction: resolveMomPlanDirection(curPlan, prevPlan),
  }
  return snapshot
}

/**
 * @param {{
 *   clubName?: string,
 *   year: number,
 *   month: number,
 *   monthRows?: object[],
 *   plan?: object | null,
 *   expenseAmount?: number,
 *   payrollClubTotal?: number,
 *   aerobicPayrollClubTotal?: number,
 *   includeFinance?: boolean,
 *   manualTrainingsTotal?: number,
 *   fitCityCompleted?: number,
 *   inactiveInPeriod?: number,
 *   trainingCompleted?: number,
 *   trainingDraft?: number,
 *   membershipTypes?: Array<{ id: string, code?: string }>,
 *   today?: Date,
 * }} opts
 */
export function buildClubMonthAnalytics(opts) {
  const year = Number(opts.year)
  const month = Number(opts.month)
  const monthRows = opts.monthRows ?? []
  const membershipTypes = opts.membershipTypes ?? []
  const planLevels = readPlanLevels(opts.plan)
  const planTotal = resolvePlanTotal(opts.plan)
  const includeFinance = opts.includeFinance !== false

  const stats = buildSalesManagerMonthStats({
    monthRows,
    planLevels,
    planDirections: {
      plan_pz: Number(opts.plan?.plan_pz) || 0,
      plan_tz: Number(opts.plan?.plan_tz) || 0,
      plan_az: Number(opts.plan?.plan_az) || 0,
      plan_extra: Number(opts.plan?.plan_extra) || 0,
    },
    planMatrix: opts.plan?.plan_matrix,
    membershipTypes,
    year,
    month,
  })

  const summary = stats.summary
  const manualTrainings = Number(opts.manualTrainingsTotal ?? summary.trainingsTotal) || 0
  const fitCity = Number(opts.fitCityCompleted) || 0
  const expense = Number(opts.expenseAmount) || 0
  const payroll = Number(opts.payrollClubTotal ?? summary.trainerPayroll) || 0
  const aerobicPayroll = Number(opts.aerobicPayrollClubTotal ?? summary.aerobicPayroll) || 0
  const matrix = stats.matrixByHall ?? sumMatrixTotalsFromDailyRows(monthRows)
  const trainingsByCardType = (stats.trainingsStats.byType ?? []).slice(0, 5).map((row) => ({
    code: row.code,
    count: row.count,
  }))
  const profitDayHighlights = profitDayHighlightsFromSeries(stats.dailySeries)
  const { start, end } = monthDateRange(year, month)
  const daysInMonth = stats.summary.daysInMonth
  const calendarContext = buildGeminiMonthCalendarContext(year, month)

  /** @type {Record<string, unknown> | undefined} */
  let finance
  if (includeFinance) {
    finance = {
      supervisor_expense: expense,
      trainer_payroll: payroll,
      aerobic_payroll: aerobicPayroll,
      net_profit: computeNetProfitWithPayroll(summary.profitTotal, payroll, expense, aerobicPayroll),
      gross_before_expense: summary.profitGrossTotal ?? summary.profitTotal,
      net_without_payroll: computeNetProfit(summary.profitTotal, expense),
    }
  }

  const insights = buildClubMonthInsights({
    stats,
    managerTrainingsTotal: manualTrainings,
    fitCityCompleted: fitCity,
    inactiveInPeriod: Number(opts.inactiveInPeriod) || 0,
    finance,
    includeFinance,
    calendarContext,
  })

  const monthForecast = buildIskraMonthForecastSummary({
    monthRows,
    year,
    month,
    expense,
    membershipTypes,
    planForm: opts.plan,
    includeFinance,
    today: opts.today,
  })

  const clubFinance = buildIskraClubFinanceBlock({
    monthRows,
    year,
    month,
    expense,
    membershipTypes,
    planForm: opts.plan,
    includeFinance,
    today: opts.today,
  })

  return {
    club_name: String(opts.clubName ?? '').trim() || 'клуб',
    period: {
      year,
      month,
      label: periodLabelRu(year, month),
      from: start,
      to: end,
      days_in_month: daysInMonth,
    },
    calendar_context: calendarContext,
    sales: {
      days_with_reports: summary.dayCount,
      report_coverage_pct: insights.report.coverage_pct,
      profit_total: summary.profitTotal,
      profit_gross_total: summary.profitGrossTotal ?? summary.profitTotal,
      refunds_total: summary.refundsTotal ?? 0,
      plan_fact_gross: resolvePlanFactFromMonthSummary(summary),
      profit_nk: summary.profitNk,
      profit_dk: summary.profitDk,
      profit_uk: summary.profitUk,
      avg_profit_per_report_day: insights.report.avg_profit_per_report_day,
      pnk_total: summary.pnkTotal,
      manual_trainings_total: manualTrainings,
      matrix_counts_pz_tz_az: {
        pz: matrix.pz,
        tz: matrix.tz,
        az: matrix.az,
        all: matrix.all,
      },
      extra_sales_rub: stats.dopRubTotal ?? 0,
      matrix_3x3: stats.matrix3x3,
      plan_matrix: opts.plan?.plan_matrix ?? {},
      matrix_plan_vs_fact: stats.planMatrixComparison ?? { has_plan_matrix: false, rows: [] },
      plan_total: planTotal,
      plan_level_1: planLevels.level1,
      plan_level_2: planLevels.level2,
      plan_level_3: planLevels.level3,
      achieved_plan_level: stats.plan.achievedLevel,
      plan_direction_rub: {
        pz: Number(opts.plan?.plan_pz) || 0,
        tz: Number(opts.plan?.plan_tz) || 0,
        az: Number(opts.plan?.plan_az) || 0,
        extra: Number(opts.plan?.plan_extra) || 0,
      },
      plan_progress_pct: stats.plan.progressPercent,
      profit_day_highlights: profitDayHighlights,
      trainings_by_card_type: trainingsByCardType,
      structure_shares: stats.structure,
      direction_structure: stats.directionStructure ?? [],
      pz_trainings_from_manager_reports: stats.trainingsTypedTotal,
    },
    trainings: {
      manager_report_total: manualTrainings,
      fit_city_tablets_only: fitCity,
      gap_manager_minus_fit_city: manualTrainings - fitCity,
    },
    operations: {
      fit_city_completed_trainings: fitCity,
      manual_vs_fit_city_gap: manualTrainings - fitCity,
      inactive_clients_in_period: Number(opts.inactiveInPeriod) || 0,
      completed_trainings_in_period: Number(opts.trainingCompleted) || 0,
      draft_trainings_in_period: Number(opts.trainingDraft) || 0,
    },
    finance,
    insights,
    month_forecast: monthForecast,
    club_finance: clubFinance,
    data_sources: buildGeminiDataSourcesMeta({
      managerReportTotal: manualTrainings,
      fitCityTotal: fitCity,
      dayCount: summary.dayCount,
      daysInMonth,
    }),
  }
}

/** KPI-полоска панели Gemini — тренировки ПЗ из отчётов менеджера за месяц. */
export function buildPanelKpiFromAnalytics(analytics) {
  if (!analytics) return null
  const sales = analytics.sales ?? {}
  const insights = analytics.insights ?? {}
  const report = insights.report ?? {}
  const profitTotal = Number(sales.profit_total) || 0
  const planTotal = Number(sales.plan_total) || 0
  const planPct = Number(sales.plan_progress_pct) || 0
  const pzTrainings = Number(sales.pz_trainings_from_manager_reports) || 0
  const reportDays = Number(report.days_with_reports) || 0
  const daysInMonth = Number(report.days_in_month) || 0
  const forecastPct = Number(analytics.club_finance?.forecast?.plan_pct) || null
  const expectedRaw =
    analytics.calendar_context?.expected_plan_progress_pct ??
    insights.plan?.calendar_expected_pct ??
    null
  const expectedPlanPct =
    expectedRaw != null && Number.isFinite(Number(expectedRaw)) ? Number(expectedRaw) : null

  let planTone = 'neutral'
  if (planTotal > 0) {
    if (expectedPlanPct != null && expectedPlanPct > 0) {
      if (planPct + 5 < expectedPlanPct) planTone = 'warn'
      else if (planPct + 2 >= expectedPlanPct) planTone = 'ok'
      else planTone = 'neutral'
    } else {
      planTone = planPct >= 85 ? 'ok' : planPct >= 45 ? 'neutral' : planPct > 0 ? 'warn' : 'neutral'
    }
  }

  return {
    profitTotal,
    planTotal,
    planPct,
    plan_progress_pct: planPct,
    expectedPlanPct,
    expected_plan_pct: expectedPlanPct,
    planFillPercent: Math.min(100, Math.max(0, planPct)),
    pzTrainings,
    reportsLabel: `${reportDays}/${daysInMonth || 0}`,
    report_days: reportDays,
    days_in_month: daysInMonth,
    hasPlan: planTotal > 0,
    forecast_pct: forecastPct,
    plan_tone: planTone,
  }
}
