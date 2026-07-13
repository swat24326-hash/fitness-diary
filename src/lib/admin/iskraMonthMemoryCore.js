/**
 * Память месяца для промпта ИСКРЫ (Эпик C).
 * Чистые функции — scripts/verify-iskra-month-memory.mjs
 */

/**
 * @param {object | null | undefined} snapshot
 * @param {object | null | undefined} previousSnapshot
 */
export function buildMonthMemoryBlock(snapshot, previousSnapshot) {
  if (!snapshot || !previousSnapshot) return null

  const mom = snapshot.insights?.mom_comparison
  if (mom) {
    return {
      source: 'mom_comparison',
      previous_period_label: mom.previous_period_label ?? previousSnapshot.period?.label ?? null,
      profit_current: mom.profit_current,
      profit_previous: mom.profit_previous,
      profit_delta: mom.profit_delta,
      profit_delta_pct: mom.profit_delta_pct,
      profit_direction: mom.profit_direction,
      profit_previous_missing: mom.profit_previous_missing === true,
      plan_pct_current: mom.plan_pct_current,
      plan_pct_previous: mom.plan_pct_previous,
      plan_previous_missing: mom.plan_previous_missing === true,
      plan_direction: mom.plan_direction,
      hint_ru:
        'Память клуба: сравнение с прошлым месяцем. Не подменяй текущий план; при profit_previous_missing не выдумывай проценты.',
    }
  }

  return {
    source: 'compact',
    previous_period_label: previousSnapshot.period?.label ?? null,
    profit_previous: Number(previousSnapshot.sales?.profit_total) || 0,
    profit_current: Number(snapshot.sales?.profit_total) || 0,
    plan_pct_previous: Number(previousSnapshot.sales?.plan_progress_pct) || 0,
    plan_pct_current: Number(snapshot.sales?.plan_progress_pct) || 0,
    hint_ru: 'Краткая память месяца без полного mom_comparison.',
  }
}

/**
 * Нужно ли подгружать snapshot прошлого месяца.
 * @param {{ comparePrevious?: boolean, responseMode?: string }} opts
 */
export function shouldLoadPreviousMonthSnapshot(opts = {}) {
  if (opts.comparePrevious === true) return true
  const mode = String(opts.responseMode ?? '').trim()
  return mode === 'standard' || mode === 'deep'
}
