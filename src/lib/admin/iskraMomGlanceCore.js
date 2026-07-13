/**
 * Сравнение с прошлым месяцем одним взглядом.
 */

import { formatPctPlain, formatRubCompact } from './iskraReplyPhrasing.js'

/**
 * @param {object | null | undefined} snapshot
 * @returns {{ line: string, direction: string } | null}
 */
export function buildMomGlanceLine(snapshot) {
  const mom = snapshot?.insights?.mom_comparison
  if (!mom || mom.profit_previous_missing) return null

  const prevLabel = String(mom.previous_period_label ?? 'прошлый месяц')
  const deltaPct = mom.profit_delta_pct
  const dir = mom.profit_direction

  let trend = 'без изменений'
  if (dir === 'up' && deltaPct != null) trend = `выше на ${formatPctPlain(deltaPct)}%`
  else if (dir === 'down' && deltaPct != null) trend = `ниже на ${formatPctPlain(Math.abs(deltaPct))}%`
  else if (dir === 'no_previous') trend = 'нет базы для сравнения'

  const cur = formatRubCompact(Number(mom.profit_current) || 0)
  const line = `К ${prevLabel}: прибыль ${cur}, ${trend}`

  return { line, direction: dir }
}
