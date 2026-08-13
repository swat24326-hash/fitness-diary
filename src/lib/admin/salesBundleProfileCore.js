/**
 * Профили GET sales — что грузить (чистая логика для API + verify).
 * default full = без регрессии для старых клиентов.
 */

/** @typedef {'full' | 'shell' | 'daily' | 'month'} SalesBundleProfile */

/**
 * @param {unknown} raw
 * @returns {SalesBundleProfile}
 */
export function normalizeSalesBundleProfile(raw) {
  const p = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (p === 'shell' || p === 'daily' || p === 'month') return p
  return 'full'
}

/**
 * @param {unknown} profileRaw
 * @param {unknown} includeFitCityRaw — '1' | 'true' | true
 */
export function salesBundleProfileFlags(profileRaw, includeFitCityRaw) {
  const profile = normalizeSalesBundleProfile(profileRaw)
  const fitExplicit =
    includeFitCityRaw === true ||
    includeFitCityRaw === 1 ||
    String(includeFitCityRaw ?? '')
      .trim()
      .toLowerCase() === '1' ||
    String(includeFitCityRaw ?? '')
      .trim()
      .toLowerCase() === 'true'

  const needMonth = profile === 'shell' || profile === 'month' || profile === 'full'
  const needDaily = profile === 'daily' || profile === 'full'
  const needPlanExpense = profile === 'shell' || profile === 'month' || profile === 'full'
  const needTypes = profile === 'shell' || profile === 'daily' || profile === 'month' || profile === 'full'
  /** Тренеры нужны и в shell/month: статистика месяца показывает ФИО, не только дневная матрица. */
  const needTrainers =
    profile === 'daily' || profile === 'full' || profile === 'shell' || profile === 'month'
  /** Fit-city: только full или явный include (дорого: все memberships + trainings дня). */
  const needFitCity = profile === 'full' || (fitExplicit && needDaily)

  return {
    profile,
    needMonth,
    needDaily,
    needPlanExpense,
    needTypes,
    needTrainers,
    needFitCity,
    /** Сырые дни месяца в JSON — нужны сосуду/прогнозу/stats. */
    includeMonthDays: needMonth,
  }
}
