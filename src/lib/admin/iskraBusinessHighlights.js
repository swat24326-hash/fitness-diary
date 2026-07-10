/** Краткие бизнес-акценты для приветствия и мгновенных ответов ИСКРЫ. */

import { formatRub } from './salesReportCore.js'
import { phrasePlanProgress } from './iskraReplyPhrasing.js'

/**
 * @param {object | null | undefined} snapshot
 */
export function buildIskraBusinessHighlights(snapshot) {
  if (!snapshot) return null

  const sales = snapshot.sales ?? {}
  const cf = snapshot.club_finance
  const planTotal = Number(sales.plan_total) || Number(sales.plan_level_3) || 0
  const planPct = Number(sales.plan_progress_pct) || 0
  const planGross = Number(sales.plan_fact_gross) || Number(sales.profit_gross_total) || 0
  const finance = snapshot.finance

  const parts = []

  if (planTotal > 0) {
    parts.push(`${phrasePlanProgress(planPct)}, ${formatRub(planGross)} из ${formatRub(planTotal)}`)
  }

  if (cf?.available) {
    const fPct = Number(cf.forecast?.plan_pct) || 0
    const fGross = Number(cf.forecast?.gross_rub) || 0
    if (cf.forecast?.will_reach_plan) {
      parts.push(`прогноз на конец месяца — ${fPct}% (${formatRub(fGross)})`)
    } else if ((Number(cf.forecast?.shortfall_rub) || 0) > 0) {
      parts.push(
        `прогноз ${fPct}% — риск недобора ${formatRub(cf.forecast.shortfall_rub)}`,
      )
    } else if (fGross > 0) {
      parts.push(`прогноз вала — ${formatRub(fGross)} (${fPct}%)`)
    }

    const netForecast = cf.forecast?.net_profit_rub
    if (netForecast != null && Number.isFinite(Number(netForecast))) {
      parts.push(`чистая прибыль к концу месяца — ${formatRub(netForecast)}`)
    }

    const lagging = (cf.forecast?.directions ?? []).filter(
      (d) =>
        (Number(d.plan_target_rub) || 0) > 0 &&
        (Number(d.forecast_progress_pct) || 0) < 90,
    )
    if (lagging.length) {
      const names = lagging.map((d) => d.label).join(', ')
      parts.push(`по прогнозу отстают: ${names}`)
    }
  } else if (finance?.net_profit != null) {
    parts.push(`чистая прибыль сейчас — ${formatRub(finance.net_profit)}`)
  }

  if (!parts.length) return null
  return parts.join('; ')
}

/**
 * @param {object | null | undefined} snapshot
 */
export function buildIskraIntroPitch(snapshot) {
  const highlights = buildIskraBusinessHighlights(snapshot)
  const base =
    'Помогу держать план и деньги: факт и прогноз месяца, чистая прибыль, отставание по ПЗ/ТЗ/АЗ, структура НК/ДК/УК, возвраты и риски. Отвечу на любой вопрос по цифрам клуба — связываю данные и помечаю, где это моя оценка, а не отчёт.'

  if (!highlights) return base
  return `${base} Сейчас: ${highlights}.`
}
