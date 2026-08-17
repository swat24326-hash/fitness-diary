/**
 * Админ-полоса Стратегии: часы ПЗ/АЗ → ЗП → возвраты → чистая.
 * Только для админа (менеджер продаж не видит).
 */

import {
  MIN_REPORT_DAYS_FOR_FORECAST,
  buildClubFinanceForecast,
} from './clubFinanceForecastCore.js'
import { formatRub } from './salesReportCore.js'
import {
  describeNetProfitMarginTone,
  formatNetProfitMarginPercent,
} from './clubNetProfitMarginCore.js'

/** @typedef {'current' | 'next'} StrategyHorizon */

/**
 * @param {{
 *   showAdminFinanceBar?: boolean,
 *   horizon?: StrategyHorizon,
 *   targetYear?: number,
 *   targetMonth?: number,
 *   baseYear?: number,
 *   baseMonth?: number,
 *   planMonthDays?: Array<Record<string, unknown>>,
 *   prevMonthDays?: Array<Record<string, unknown>>,
 *   membershipTypes?: Array<Record<string, unknown>>,
 *   planForm?: Record<string, string | number | undefined> | null,
 *   expense?: number,
 *   today?: Date,
 *   planConfig?: object | null,
 *   profilesByTrainerId?: Map|object|null,
 *   clubId?: string,
 * }} opts
 */
export function buildStrategyAdminFinanceBar(opts) {
  if (!opts?.showAdminFinanceBar) {
    return { visible: false, ok: false, reason: 'hidden' }
  }

  const horizon = opts.horizon === 'next' ? 'next' : 'current'
  const expense = Number(opts.expense) || 0
  const membershipTypes = opts.membershipTypes ?? []
  const planForm = opts.planForm ?? null
  const today = opts.today ?? new Date()
  const payrollOpts = {
    planConfig: opts.planConfig,
    profilesByTrainerId: opts.profilesByTrainerId,
    clubId: opts.clubId,
  }

  if (horizon === 'next') {
    const year = Number(opts.baseYear)
    const month = Number(opts.baseMonth)
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return {
        visible: true,
        ok: false,
        reason: 'no_base_month',
        hint: 'Нет прошлого месяца для ориентира по часам и прибыли.',
      }
    }
    const fc = buildClubFinanceForecast({
      monthRows: opts.prevMonthDays ?? [],
      year,
      month,
      expense,
      membershipTypes,
      planForm,
      today,
      ...payrollOpts,
    })
    if (!fc.ok) {
      return {
        visible: true,
        ok: false,
        reason: fc.reason || 'base_unavailable',
        hint: 'Мало отчётов прошлого месяца — полоса появится после заполнения дней.',
        reportDays: fc.reportDays,
        minReportDays: fc.minReportDays ?? MIN_REPORT_DAYS_FOR_FORECAST,
      }
    }
    return {
      visible: true,
      ok: true,
      mode: 'base_fact',
      title: 'Ориентир: прошлый месяц',
      subtitle: 'Часы, ЗП, возвраты и чистая по факту базы (следующий месяц ещё без дней).',
      year,
      month,
      closedMonth: true,
      fact: fc.fact,
      forecast: fc.forecast,
      refundsPaced: false,
      cells: buildAdminFinanceCells(fc, { closedMonth: true }),
    }
  }

  const year = Number(opts.targetYear)
  const month = Number(opts.targetMonth)
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return {
      visible: true,
      ok: false,
      reason: 'no_target_month',
      hint: 'Не выбран месяц плана.',
    }
  }

  const fc = buildClubFinanceForecast({
    monthRows: opts.planMonthDays ?? [],
    year,
    month,
    expense,
    membershipTypes,
    planForm,
    today,
    ...payrollOpts,
  })

  if (!fc.ok) {
    const hint =
      fc.reason === 'insufficient_reports'
        ? `Прогноз нагрузки появится после ${fc.minReportDays ?? MIN_REPORT_DAYS_FOR_FORECAST} отчётов (сейчас ${fc.reportDays ?? 0}).`
        : fc.reason === 'not_current_month'
          ? 'Для текущего горизонта нужен текущий календарный месяц.'
          : 'Не удалось посчитать полосу.'
    return {
      visible: true,
      ok: false,
      reason: fc.reason || 'unavailable',
      hint,
      reportDays: fc.reportDays,
      minReportDays: fc.minReportDays ?? MIN_REPORT_DAYS_FOR_FORECAST,
    }
  }

  return {
    visible: true,
    ok: true,
    mode: fc.closedMonth ? 'closed_fact' : 'month_forecast',
    title: fc.closedMonth ? 'Итог месяца' : 'К концу месяца',
    subtitle: fc.closedMonth
      ? 'Факт отчётов: часы, ЗП, возвраты, чистая.'
      : 'Прикидка из отчётов: часы ПЗ/АЗ → ЗП → среднее по возвратам → чистая.',
    year,
    month,
    closedMonth: Boolean(fc.closedMonth),
    fact: fc.fact,
    forecast: fc.forecast,
    refundsPaced: Boolean(fc.refundsPace?.paced),
    refundsMethod: fc.refundsPace?.method ?? null,
    payrollPace: fc.payrollPace ?? null,
    cells: buildAdminFinanceCells(fc, { closedMonth: Boolean(fc.closedMonth) }),
  }
}

/**
 * @param {ReturnType<typeof buildClubFinanceForecast>} fc
 * @param {{ closedMonth?: boolean }} opts
 */
export function buildAdminFinanceCells(fc, opts = {}) {
  const closed = Boolean(opts.closedMonth || fc.closedMonth)
  const fact = fc.fact
  const forecast = fc.forecast
  const showForecast = !closed

  /** @type {Array<{ key: string, label: string, kind: 'count' | 'money' | 'percent', fact: number, forecast: number | null, primary?: boolean, signed?: boolean, marginTone?: string }>} */
  const cells = [
    {
      key: 'pzTrainings',
      label: 'Тренировки ПЗ',
      kind: 'count',
      fact: fact.pzTrainings,
      forecast: showForecast ? forecast.pzTrainings : null,
    },
    {
      key: 'azTrainings',
      label: 'Тренировки АЗ',
      kind: 'count',
      fact: fact.azTrainings,
      forecast: showForecast ? forecast.azTrainings : null,
    },
    {
      key: 'trainerPayroll',
      label: 'ЗП ПЗ',
      kind: 'money',
      fact: fact.trainerPayroll,
      forecast: showForecast ? forecast.trainerPayroll : null,
    },
    {
      key: 'aerobicPayroll',
      label: 'ЗП АЗ',
      kind: 'money',
      fact: fact.aerobicPayroll,
      forecast: showForecast ? forecast.aerobicPayroll : null,
    },
    {
      key: 'refunds',
      label: 'Возвраты',
      kind: 'money',
      fact: fact.refunds,
      forecast: showForecast ? forecast.refunds : null,
    },
    {
      key: 'netProfit',
      label: 'Чистая',
      kind: 'money',
      fact: fact.netProfit,
      forecast: showForecast ? forecast.netProfit : null,
      primary: true,
      signed: true,
    },
    {
      key: 'netProfitMargin',
      label: 'Маржа',
      kind: 'percent',
      fact: fact.netProfitMargin,
      forecast: showForecast ? forecast.netProfitMargin : null,
      primary: true,
      marginTone: describeNetProfitMarginTone(
        showForecast ? forecast.netProfitMargin : fact.netProfitMargin,
      ).tone,
    },
  ]
  return cells
}

/**
 * @param {'count' | 'money'} kind
 * @param {number} value
 * @param {{ signed?: boolean }} [opts]
 */
export function formatStrategyAdminFinanceValue(kind, value, opts = {}) {
  if (kind === 'count') return new Intl.NumberFormat('ru-RU').format(Number(value) || 0)
  if (kind === 'percent') return formatNetProfitMarginPercent(value)
  const n = Number(value) || 0
  return formatRub(opts.signed ? n : Math.abs(n))
}
