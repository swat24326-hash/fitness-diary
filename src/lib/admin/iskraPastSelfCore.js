/**
 * «Мой клуб vs прошлый я» — нарратив для SparkBrief / промпта.
 */

import { formatPctPlain, formatRubCompact } from './iskraReplyPhrasing.js'
import { buildAdviceOutcomeSparkLine } from './iskraAdviceOutcomeCore.js'

/**
 * @param {object | null | undefined} snapshot
 * @param {{ outcomes?: Array<object> }} [opts]
 * @returns {{
 *   line: string,
 *   promptBlock: string,
 *   direction: string,
 *   planDeltaPct: number | null,
 *   profitDeltaPct: number | null,
 * } | null}
 */
export function buildPastSelfComparison(snapshot, opts = {}) {
  const mom = snapshot?.insights?.mom_comparison
  const sales = snapshot?.sales ?? {}
  const planPct = Number(snapshot?.insights?.plan?.pct ?? sales.plan_progress_pct) || 0

  if (!mom || mom.profit_previous_missing) {
    const outcomeLine = buildAdviceOutcomeSparkLine(opts.outcomes ?? [])
    if (outcomeLine) {
      return {
        line: `Вы vs прошлый вы: ${outcomeLine}`,
        promptBlock: `СРАВНЕНИЕ С СОБОЙ: ${outcomeLine}. Опирайся на исходы советов, не на выдуманный прошлый месяц.`,
        direction: 'outcome_only',
        planDeltaPct: null,
        profitDeltaPct: null,
      }
    }
    return null
  }

  const prevLabel = String(mom.previous_period_label ?? 'прошлый месяц')
  const profitDir = String(mom.profit_direction ?? '')
  const profitDelta = mom.profit_delta_pct != null ? Number(mom.profit_delta_pct) : null
  const planDelta =
    mom.plan_delta_pct != null
      ? Number(mom.plan_delta_pct)
      : mom.plan_progress_delta_pct != null
        ? Number(mom.plan_progress_delta_pct)
        : null

  let profitPart = 'прибыль без сравнения'
  if (profitDir === 'up' && profitDelta != null) {
    profitPart = `прибыль выше на ${formatPctPlain(profitDelta)}%`
  } else if (profitDir === 'down' && profitDelta != null) {
    profitPart = `прибыль ниже на ${formatPctPlain(Math.abs(profitDelta))}%`
  } else if (profitDir === 'flat') {
    profitPart = 'прибыль почти как тогда'
  }

  const planPart =
    planDelta != null && Number.isFinite(planDelta)
      ? `план ${planDelta > 0 ? '+' : ''}${formatPctPlain(planDelta)} п.п.`
      : planPct > 0
        ? `сейчас план ${formatPctPlain(planPct)}%`
        : null

  const curProfit = formatRubCompact(Number(mom.profit_current) || Number(sales.profit_total) || 0)
  const bits = [`к ${prevLabel}`, curProfit, profitPart, planPart].filter(Boolean)
  const line = `Вы vs прошлый вы: ${bits.join(' · ')}`

  const outcomeLine = buildAdviceOutcomeSparkLine(opts.outcomes ?? [])
  const promptParts = [
    `СРАВНЕНИЕ С СОБОЙ (не с другими клубами): ${line}.`,
    outcomeLine ? `Исход советов: ${outcomeLine}.` : '',
    'Подчёркивай, что сработало у ЭТОГО клуба раньше; не ссылайся на чужие бенчмарки.',
  ]

  return {
    line,
    promptBlock: promptParts.filter(Boolean).join(' '),
    direction: profitDir || 'unknown',
    planDeltaPct: planDelta,
    profitDeltaPct: profitDelta,
  }
}
