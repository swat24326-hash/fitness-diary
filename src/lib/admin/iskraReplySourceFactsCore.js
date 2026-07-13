/**
 * Факты-источники под ответом ИСКРЫ (доверие к цифрам).
 */

import { deriveReplySignalKey } from './iskraLearningCore.js'
import { formatRubCompact, formatPctPlain } from './iskraReplyPhrasing.js'

/**
 * @param {object | null | undefined} snapshot
 * @param {string} [userMessage]
 * @param {{ chipId?: string, handlerId?: string }} [meta]
 * @returns {string[]}
 */
export function deriveSourceFactsForReply(snapshot, userMessage = '', meta = {}) {
  if (!snapshot) return []
  const key = deriveReplySignalKey(userMessage, {
    chip_id: meta.chipId,
    handler_id: meta.handlerId,
  })
  const facts = []
  const sales = snapshot.sales ?? {}
  const insights = snapshot.insights ?? {}
  const plan = insights.plan ?? {}
  const mom = insights.mom_comparison

  const push = (line) => {
    const t = String(line ?? '').trim()
    if (t && facts.length < 3 && !facts.includes(t)) facts.push(t)
  }

  if (key.includes('plan') || key.includes('advice') || key.includes('forecast')) {
    if (plan.pct != null) push(`План продаж: ${formatPctPlain(plan.pct)}%`)
    const cf = snapshot.club_finance?.forecast
    if (cf?.plan_pct != null) push(`Прогноз плана: ${formatPctPlain(cf.plan_pct)}%`)
    if (sales.profit_total != null) push(`Выручка месяца: ${formatRubCompact(sales.profit_total)}`)
  }

  if (key.includes('finance') || key.includes('payroll')) {
    const net = snapshot.finance?.net_profit
    if (net != null) push(`Чистая прибыль: ${formatRubCompact(net)}`)
    const payroll = snapshot.finance?.trainer_payroll
    if (payroll != null) push(`ЗП зала (ПЗ): ${formatRubCompact(payroll)}`)
  }

  if (key.includes('trainer') || key.includes('inactive')) {
    const roll = snapshot.trainer_contour?.club_roll_up
    if (roll?.inactive_clients_holders != null) {
      push(`Неактивных клиентов (зал): ${roll.inactive_clients_holders}`)
    }
    if (roll?.completed_trainings != null) push(`Завершённых тренировок: ${roll.completed_trainings}`)
  }

  if (key.includes('compare') && mom && !mom.profit_previous_missing) {
    push(`Прибыль сейчас: ${formatRubCompact(mom.profit_current)}`)
    push(`Прибыль ${mom.previous_period_label ?? 'в прошлом месяце'}: ${formatRubCompact(mom.profit_previous)}`)
  }

  if (facts.length < 2) {
    if (sales.plan_progress_pct != null) push(`Выполнение плана: ${formatPctPlain(sales.plan_progress_pct)}%`)
    if (sales.days_with_reports != null) push(`Дней с отчётами: ${sales.days_with_reports}`)
  }

  return facts.slice(0, 3)
}
