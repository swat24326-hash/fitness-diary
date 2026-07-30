/**
 * Сезонность продаж зала (коэф. к объёму часов/₽).
 * Стартовые значения — типовой фитнес-календарь; позже — правка на клуб.
 */

/** @typedef {'season' | 'soft' | 'mixed'} SalesSeasonMode */

/**
 * @typedef {{
 *   coef: number,
 *   mode: SalesSeasonMode,
 *   labelRu: string,
 * }} SalesSeasonMonthDef
 */

/** @type {Record<number, SalesSeasonMonthDef>} */
export const SALES_SEASON_DEFAULTS = Object.freeze({
  1: { coef: 0.97, mode: 'mixed', labelRu: '50/50' },
  2: { coef: 1.15, mode: 'season', labelRu: 'сезон' },
  3: { coef: 1.15, mode: 'season', labelRu: 'сезон' },
  4: { coef: 1.15, mode: 'season', labelRu: 'сезон' },
  5: { coef: 0.85, mode: 'soft', labelRu: 'слабо' },
  6: { coef: 0.85, mode: 'soft', labelRu: 'слабо' },
  7: { coef: 0.85, mode: 'soft', labelRu: 'слабо' },
  8: { coef: 0.85, mode: 'soft', labelRu: 'слабо' },
  9: { coef: 0.85, mode: 'soft', labelRu: 'слабо' },
  10: { coef: 1.15, mode: 'season', labelRu: 'сезон' },
  11: { coef: 1.15, mode: 'season', labelRu: 'сезон' },
  12: { coef: 0.8, mode: 'soft', labelRu: 'слабо' },
})

/** @param {unknown} month 1–12 */
export function normalizeSeasonMonth(month) {
  const m = Math.trunc(Number(month))
  if (!Number.isFinite(m) || m < 1 || m > 12) return null
  return m
}

/**
 * @param {number} month 1–12
 * @param {Record<number, SalesSeasonMonthDef>} [table]
 * @returns {SalesSeasonMonthDef | null}
 */
export function getSalesSeasonMonthDef(month, table = SALES_SEASON_DEFAULTS) {
  const m = normalizeSeasonMonth(month)
  if (!m) return null
  const row = table?.[m] ?? SALES_SEASON_DEFAULTS[m]
  if (!row) return null
  const coef = Number(row.coef)
  if (!Number.isFinite(coef) || coef <= 0) return { ...SALES_SEASON_DEFAULTS[m] }
  return {
    coef,
    mode: row.mode === 'season' || row.mode === 'mixed' || row.mode === 'soft' ? row.mode : 'soft',
    labelRu: String(row.labelRu ?? '').trim() || SALES_SEASON_DEFAULTS[m].labelRu,
  }
}

/**
 * Множитель: перенос объёма с месяца базы на месяц плана через сезон.
 * scale = coef(plan) / coef(base)
 * @param {number} baseMonth
 * @param {number} planMonth
 * @param {Record<number, SalesSeasonMonthDef>} [table]
 */
export function salesSeasonScale(baseMonth, planMonth, table = SALES_SEASON_DEFAULTS) {
  const base = getSalesSeasonMonthDef(baseMonth, table)
  const plan = getSalesSeasonMonthDef(planMonth, table)
  if (!base || !plan || !(base.coef > 0)) return null
  return Math.round((plan.coef / base.coef) * 1000) / 1000
}

/** @param {SalesSeasonMode | string} mode */
export function salesSeasonModeLabelRu(mode) {
  if (mode === 'season') return 'сезон'
  if (mode === 'mixed') return '50/50'
  if (mode === 'soft') return 'слабо'
  return '—'
}
