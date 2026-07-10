/** Краткие бизнес-акценты для приветствия и мгновенных ответов ИСКРЫ. */

import { formatRub } from './salesReportCore.js'
import { phrasePlanProgress, formatRubCompact } from './iskraReplyPhrasing.js'

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
    parts.push(`${phrasePlanProgress(planPct)} — ${formatRub(planGross)} из ${formatRubCompact(planTotal)}`)
  }

  if (cf?.available) {
    const fPct = Number(cf.forecast?.plan_pct) || 0
    if (cf.forecast?.will_reach_plan) {
      parts.push(`прогноз ${String(fPct).replace('.', ',')}%`)
    } else if ((Number(cf.forecast?.shortfall_rub) || 0) > 0) {
      parts.push(`прогноз ${String(fPct).replace('.', ',')}%, риск ${formatRubCompact(cf.forecast.shortfall_rub)}`)
    } else if (fPct > 0) {
      parts.push(`прогноз ${String(fPct).replace('.', ',')}%`)
    }

    const netForecast = cf.forecast?.net_profit_rub
    if (netForecast != null && Number.isFinite(Number(netForecast))) {
      parts.push(`прибыль ${formatRubCompact(netForecast)}`)
    }
  } else if (finance?.net_profit != null) {
    parts.push(`прибыль ${formatRub(finance.net_profit)}`)
  }

  if (!parts.length) return null
  return parts.slice(0, 2).join('; ')
}

/**
 * @param {object | null | undefined} snapshot
 */
export function buildIskraIntroPitch(snapshot) {
  const highlights = buildIskraBusinessHighlights(snapshot)
  const base = 'План, прогноз и прибыль клуба — спрашивайте по цифрам.'

  if (!highlights) return base
  return `${base} Сейчас: ${highlights}.`
}
