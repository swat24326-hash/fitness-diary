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
  return parts.slice(0, 2).join(', ')
}

/** Короткие «рекламные» строки для «Кто ты?» — без цифр месяца (их даёт кнопка «План»). */
export const ISKRA_INTRO_AD_LINES = [
  'Бортовая ЭВМ для управляющего: план, прогноз, риски — без паники и без десятка Excel.',
  'Считаю за вас: дотянем ли месяц, где деньги, кто проседает по залам — спросите, отвечу.',
  'Не кофе и не чат: советская аналитика FIT-CITY — цифры клуба в двух-трёх фразах.',
  'Ваш говорящий штаб: план, прогноз, прибыль и тренеры — кнопкой или голосом.',
  'Работаю от отчётов, не от догадок: подскажу, где дожать план, пока месяц не в архиве.',
]

/**
 * @param {number} [seed]
 */
export function buildIskraIntroAdPitch(seed = 0) {
  const pool = ISKRA_INTRO_AD_LINES
  if (!pool.length) return 'План, прогноз, прибыль — по запросу.'
  const i = Math.abs(Math.trunc(seed)) % pool.length
  return pool[i]
}

/** @param {string} club @param {string} period */
export function introAdSeed(club, period) {
  return String(club + period)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
}

/**
 * Рекламный питч для «Кто ты?» — без цифр из snapshot.
 * @param {object | null | undefined} [_snapshot]
 * @param {number} [seed]
 */
export function buildIskraIntroPitch(_snapshot, seed = 0) {
  return buildIskraIntroAdPitch(seed)
}
