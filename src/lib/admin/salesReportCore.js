/** Чистая логика отчётов продаж (без React / IDB). */



import { inputMapToMatrixRows, sumMatrixRows } from './salesTrainingsMatrix.js'



export const SALES_MATRIX_ROWS = [

  { key: 'pz', label: 'ПЗ' },

  { key: 'tz', label: 'ТЗ' },

  { key: 'az', label: 'АЗ' },

]



export const SALES_MATRIX_COLS = [

  { suffix: 'nk', label: 'НК' },

  { suffix: 'dk', label: 'ДК' },

  { suffix: 'uk', label: 'УК' },

]



export const SALES_MATRIX_KEYS = [

  'pz_nk',

  'pz_dk',

  'pz_uk',

  'tz_nk',

  'tz_dk',

  'tz_uk',

  'az_nk',

  'az_dk',

  'az_uk',

]



/** @param {string} countKey e.g. pz_nk */

export function salesMatrixSumKey(countKey) {

  return `${countKey}_sum`

}



/** @param {string} rowKey @param {string} colSuffix */

export function salesMatrixCellKeys(rowKey, colSuffix) {

  const countKey = `${rowKey}_${colSuffix}`

  return { countKey, sumKey: salesMatrixSumKey(countKey) }

}



/** @param {Record<string, string>} form */

export function salesMatrixColumnTotals(form) {

  const totals = { nk: 0, dk: 0, uk: 0 }

  for (const row of SALES_MATRIX_ROWS) {

    for (const col of SALES_MATRIX_COLS) {

      totals[col.suffix] += parseSalesCount(form[`${row.key}_${col.suffix}`]) || 0

    }

  }

  return totals

}



/** @param {Record<string, string>} form @param {string} rowKey pz|tz|az */

export function salesMatrixRowMembershipTotal(form, rowKey) {

  let sum = 0

  for (const col of SALES_MATRIX_COLS) {

    sum += parseSalesCount(form[`${rowKey}_${col.suffix}`]) || 0

  }

  return sum

}



/** @param {Record<string, string>} form @param {string} countKey */

export function salesMatrixCellSum(form, countKey) {

  return parseSalesMoney(form[salesMatrixSumKey(countKey)]) || 0

}



/**

 * Средний чек ячейки = сумма / количество.

 * @param {Record<string, string>} form

 * @param {string} countKey

 */

export function salesMatrixCellAvgCheck(form, countKey) {

  const count = parseSalesCount(form[countKey]) || 0

  const sum = salesMatrixCellSum(form, countKey)

  if (count <= 0 || sum <= 0) return null

  return Math.round((sum / count) * 100) / 100

}



/** @param {Record<string, string>} form @param {string} rowKey */

export function salesMatrixRowSumTotal(form, rowKey) {

  let total = 0

  for (const col of SALES_MATRIX_COLS) {

    total += salesMatrixCellSum(form, `${rowKey}_${col.suffix}`)

  }

  return Math.round(total * 100) / 100

}



/**

 * Средний чек по направлению (ПЗ/ТЗ/АЗ): сумма продаж / количество абонементов.

 * @param {Record<string, string>} form

 * @param {string} rowKey

 */

export function salesMatrixRowAvgCheck(form, rowKey) {

  const count = salesMatrixRowMembershipTotal(form, rowKey)

  const sum = salesMatrixRowSumTotal(form, rowKey)

  if (count <= 0 || sum <= 0) return null

  return Math.round((sum / count) * 100) / 100

}



/**

 * Прибыль по категориям = сумма продаж по столбцу матрицы.

 * @param {Record<string, string>} form

 */

export function computeProfitFromMatrix(form) {

  const profit = { profit_nk: 0, profit_dk: 0, profit_uk: 0 }



  for (const row of SALES_MATRIX_ROWS) {

    for (const col of SALES_MATRIX_COLS) {

      const { countKey, sumKey } = salesMatrixCellKeys(row.key, col.suffix)

      const count = parseSalesCount(form[countKey]) || 0

      const sumRaw = form[sumKey]

      const hasSum = sumRaw != null && sumRaw !== ''



      if (count <= 0 && !hasSum) continue



      if (count > 0 && !hasSum) {

        return { ok: false, error: `${row.label} ${col.label}: укажите сумму продаж` }

      }

      if (count <= 0 && hasSum) {

        return { ok: false, error: `${row.label} ${col.label}: укажите количество абонементов` }

      }



      const sum = parseSalesMoney(sumRaw)

      if (Number.isNaN(sum)) {

        return { ok: false, error: `${row.label} ${col.label}: сумма ≥ 0` }

      }

      profit[`profit_${col.suffix}`] += sum

    }

  }



  for (const col of SALES_MATRIX_COLS) {

    profit[`profit_${col.suffix}`] = Math.round(profit[`profit_${col.suffix}`] * 100) / 100

  }



  return {

    ok: true,

    ...profit,

    profit_day: computeProfitDay(profit.profit_nk, profit.profit_dk, profit.profit_uk),

  }

}



/** @param {Record<string, string>} form */

export function buildMatrixAmountsPayload(form) {

  const amounts = {}

  for (const key of SALES_MATRIX_KEYS) {

    const sumKey = salesMatrixSumKey(key)

    const raw = form[sumKey]

    if (raw == null || raw === '') continue

    const sum = parseSalesMoney(raw)

    if (Number.isNaN(sum)) return { ok: false, error: 'Матрица: суммы ≥ 0' }

    if (sum > 0) amounts[key] = sum

  }

  return { ok: true, matrix_amounts: amounts }

}



/** @param {unknown} raw */

export function matrixAmountsFromDb(raw) {

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const out = {}

  for (const key of SALES_MATRIX_KEYS) {

    const v = raw[key]

    if (v == null || v === '') continue

    const n = parseSalesMoney(v)

    if (!Number.isNaN(n) && n > 0) out[key] = n

  }

  return out

}



/** @param {Record<string, string>} f @param {Record<string, unknown> | null | undefined} row */

function hydrateMatrixSums(f, row) {

  const stored = matrixAmountsFromDb(row?.matrix_amounts)

  if (Object.keys(stored).length) {

    for (const key of SALES_MATRIX_KEYS) {

      const sum = stored[key]

      f[salesMatrixSumKey(key)] = sum != null ? String(sum) : ''

    }

    return f

  }



  for (const col of SALES_MATRIX_COLS) {

    const colProfit = parseSalesMoney(row?.[`profit_${col.suffix}`]) || 0

    const colTotal = salesMatrixColumnTotals(f)[col.suffix]

    if (colTotal <= 0 || colProfit <= 0) continue

    for (const matrixRow of SALES_MATRIX_ROWS) {

      const countKey = `${matrixRow.key}_${col.suffix}`

      const count = parseSalesCount(f[countKey]) || 0

      if (count <= 0) continue

      const sum = Math.round(((colProfit * count) / colTotal) * 100) / 100

      f[salesMatrixSumKey(countKey)] = String(sum)

    }

  }

  return f

}



/** @param {string} iso YYYY-MM-DD */

export function monthPartsFromIso(iso) {

  const s = String(iso ?? '').slice(0, 10)

  const y = Number(s.slice(0, 4))

  const m = Number(s.slice(5, 7))

  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null

  return { year: y, month: m }

}



/** @param {number} year @param {number} month 1–12 */

export function monthDateRange(year, month) {

  const y = Number(year)

  const m = Number(month)

  const start = `${y}-${String(m).padStart(2, '0')}-01`

  const lastDay = new Date(y, m, 0).getDate()

  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  return { start, end }

}



export function parseSalesMoney(raw) {

  const s = String(raw ?? '')

    .trim()

    .replace(/\s/g, '')

    .replace(',', '.')

  if (!s) return 0

  const n = Number(s)

  if (!Number.isFinite(n) || n < 0) return NaN

  return Math.round(n * 100) / 100

}



export function parseSalesCount(raw) {

  const s = String(raw ?? '').trim().replace(/\s/g, '')

  if (!s) return 0

  const n = Math.floor(Number(s.replace(',', '.')))

  if (!Number.isFinite(n) || n < 0) return NaN

  return n

}



export function computeProfitDay(profitNk, profitDk, profitUk) {

  const nk = Number(profitNk) || 0

  const dk = Number(profitDk) || 0

  const uk = Number(profitUk) || 0

  return Math.round((nk + dk + uk) * 100) / 100

}



export function computeNetProfit(earnings, expense) {

  const e = Number(earnings) || 0

  const x = Number(expense) || 0

  return Math.round((e - x) * 100) / 100

}



export function planProgressPercent(fact, planTotal) {

  const f = Number(fact) || 0

  const p = Number(planTotal) || 0

  if (p <= 0) return 0

  return Math.round((f / p) * 1000) / 10

}



export function formatRub(amount) {

  const n = Number(amount)

  if (!Number.isFinite(n)) return '—'

  const rounded = Math.round(n)

  return `${new Intl.NumberFormat('ru-RU').format(rounded)} ₽`

}



export function emptyDailyForm() {

  const f = {

    pnk_total: '',

    trainings_count: '',

  }

  for (const key of SALES_MATRIX_KEYS) {

    f[key] = ''

    f[salesMatrixSumKey(key)] = ''

  }

  return f

}



/** @param {Record<string, unknown> | null | undefined} row */

export function dailyRowToForm(row) {

  if (!row) return emptyDailyForm()

  const f = emptyDailyForm()

  for (const k of ['pnk_total', 'trainings_count', ...SALES_MATRIX_KEYS]) {

    const v = row[k]

    f[k] = v == null || v === '' ? '' : String(Math.trunc(Number(v) || 0))

  }

  return hydrateMatrixSums(f, row)

}



/**

 * @param {Record<string, string>} form

 * @param {{ trainerIds?: string[], membershipTypes?: object[], matrixInput?: Record<string, string> } | null} opts

 */

export function dailyFormToPayload(form, opts = null) {

  for (const key of SALES_MATRIX_KEYS) {

    const n = parseSalesCount(form[key])

    if (Number.isNaN(n)) return { ok: false, error: 'Матрица: целые числа ≥ 0' }

  }



  const amountsParsed = buildMatrixAmountsPayload(form)

  if (!amountsParsed.ok) return amountsParsed



  const profitCalc = computeProfitFromMatrix(form)

  if (!profitCalc.ok) return profitCalc

  const { profit_nk, profit_dk, profit_uk } = profitCalc



  const pnk_total = parseSalesCount(form.pnk_total)

  if (Number.isNaN(pnk_total)) {

    return { ok: false, error: 'ПНК: целое число ≥ 0' }

  }



  let trainings_count

  let trainings_matrix = []



  if (opts?.matrixInput && Array.isArray(opts.trainerIds)) {

    const parsedMatrix = inputMapToMatrixRows(

      opts.matrixInput,

      opts.trainerIds,

      opts.membershipTypes ?? [],

    )

    if (!parsedMatrix.ok) return parsedMatrix

    trainings_matrix = parsedMatrix.rows

    trainings_count = sumMatrixRows(trainings_matrix)

  } else {

    trainings_count = parseSalesCount(form.trainings_count)

    if (Number.isNaN(trainings_count)) {

      return { ok: false, error: 'Тренировки: целое число ≥ 0' }

    }

  }



  const payload = {

    profit_nk,

    profit_dk,

    profit_uk,

    pnk_total,

    trainings_count,

    trainings_matrix,

    matrix_amounts: amountsParsed.matrix_amounts,

  }

  for (const key of SALES_MATRIX_KEYS) {

    payload[key] = parseSalesCount(form[key]) || 0

  }

  return { ok: true, payload }

}



/** @param {Array<Record<string, unknown>>} rows */

export function aggregateMonthFromDailyRows(rows) {

  let profitNk = 0

  let profitDk = 0

  let profitUk = 0

  let profitTotal = 0

  let trainingsTotal = 0

  let dayCount = 0

  for (const r of rows ?? []) {

    const nk = Number(r.profit_nk) || 0

    const dk = Number(r.profit_dk) || 0

    const uk = Number(r.profit_uk) || 0

    profitNk += nk

    profitDk += dk

    profitUk += uk

    profitTotal += computeProfitDay(nk, dk, uk)

    trainingsTotal += Number(r.trainings_count) || 0

    dayCount += 1

  }

  return {

    profitNk: Math.round(profitNk * 100) / 100,

    profitDk: Math.round(profitDk * 100) / 100,

    profitUk: Math.round(profitUk * 100) / 100,

    profitTotal: Math.round(profitTotal * 100) / 100,

    trainingsTotal,

    dayCount,

  }

}



export const PLAN_LEVEL_KEYS = ['plan_level_1', 'plan_level_2', 'plan_level_3']

export const PLAN_DIRECTION_KEYS = ['plan_pz', 'plan_tz', 'plan_az']

export const PLAN_LEVEL_LABELS = ['Уровень 1', 'Уровень 2', 'Уровень 3']

/** @param {Record<string, unknown> | null | undefined} rowOrForm */
export function sumPlanDirections(rowOrForm) {
  return PLAN_DIRECTION_KEYS.reduce((acc, key) => acc + (Number(rowOrForm?.[key]) || 0), 0)
}

/** @param {Record<string, unknown> | null | undefined} rowOrForm */
export function readPlanLevels(rowOrForm) {
  return {
    level1: Number(rowOrForm?.plan_level_1) || 0,
    level2: Number(rowOrForm?.plan_level_2) || 0,
    level3: Number(rowOrForm?.plan_level_3) || 0,
  }
}

/** Финальная цель месяца = уровень 3 (верхний порог), не сумма уровней. */
export function resolvePlanFinalTarget(rowOrForm) {
  const { level1, level2, level3 } = readPlanLevels(rowOrForm)
  if (level3 > 0) return Math.round(level3 * 100) / 100
  const maxLevel = Math.max(level1, level2, level3)
  if (maxLevel > 0) return Math.round(maxLevel * 100) / 100
  return Math.round((Number(rowOrForm?.plan_total) || 0) * 100) / 100
}

/** @deprecated alias — для сосуда и KPI: финальный порог (уровень 3). */
export function resolvePlanTotal(rowOrForm) {
  return resolvePlanFinalTarget(rowOrForm)
}

/** @param {number} fact @param {{ level1?: number, level2?: number, level3?: number }} levels */
export function resolveAchievedPlanLevel(fact, levels) {
  const f = Number(fact) || 0
  const l3 = Number(levels?.level3) || 0
  const l2 = Number(levels?.level2) || 0
  const l1 = Number(levels?.level1) || 0
  if (l3 > 0 && f >= l3 - 0.009) return 3
  if (l2 > 0 && f >= l2 - 0.009) return 2
  if (l1 > 0 && f >= l1 - 0.009) return 1
  return 0
}

/** @param {Record<string, string>} form */
export function evaluatePlanDirectionsForm(form) {
  const plan_level_3 = parseSalesMoney(form.plan_level_3)
  const plan_pz = parseSalesMoney(form.plan_pz)
  const plan_tz = parseSalesMoney(form.plan_tz)
  const plan_az = parseSalesMoney(form.plan_az)
  const invalid =
    [plan_level_3, plan_pz, plan_tz, plan_az].some((n) => Number.isNaN(n)) ||
    [plan_pz, plan_tz, plan_az].some((n) => n < 0)
  const finalTarget = Number.isNaN(plan_level_3) ? 0 : Math.round(plan_level_3 * 100) / 100
  const directionSum = Number.isNaN(plan_pz + plan_tz + plan_az)
    ? 0
    : Math.round((plan_pz + plan_tz + plan_az) * 100) / 100
  const noFinal = finalTarget <= 0
  const exactMatch = !noFinal && Math.abs(directionSum - finalTarget) <= 0.009
  const directionsMismatch = !noFinal && directionSum > 0 && !exactMatch
  return {
    invalid,
    finalTarget,
    directionSum,
    noFinal,
    exactMatch,
    directionsMismatch,
    canSave: !invalid && !noFinal && exactMatch && directionSum > 0,
  }
}

/**
 * @param {Record<string, string>} form
 * @param {{ scope?: 'all' | 'levels' | 'directions' }} [opts]
 */
export function planFormToPayload(form, opts = {}) {
  const scope = opts.scope ?? 'all'
  const plan_level_1 = parseSalesMoney(form.plan_level_1)
  const plan_level_2 = parseSalesMoney(form.plan_level_2)
  const plan_level_3 = parseSalesMoney(form.plan_level_3)
  const plan_pz = parseSalesMoney(form.plan_pz)
  const plan_tz = parseSalesMoney(form.plan_tz)
  const plan_az = parseSalesMoney(form.plan_az)

  if ([plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az].some((n) => Number.isNaN(n))) {
    return { ok: false, error: 'План: неотрицательные суммы' }
  }

  if (scope === 'levels' || scope === 'all') {
    if (plan_level_1 > 0 && plan_level_2 > 0 && plan_level_2 + 0.009 < plan_level_1) {
      return { ok: false, error: 'Уровень 2 не может быть ниже уровня 1' }
    }
    if (plan_level_2 > 0 && plan_level_3 > 0 && plan_level_3 + 0.009 < plan_level_2) {
      return { ok: false, error: 'Уровень 3 (финал) не может быть ниже уровня 2' }
    }
    if (plan_level_1 > 0 && plan_level_3 > 0 && plan_level_2 <= 0 && plan_level_3 + 0.009 < plan_level_1) {
      return { ok: false, error: 'Уровень 3 не может быть ниже уровня 1' }
    }
  }

  const plan_total = plan_level_3 > 0 ? plan_level_3 : Math.max(plan_level_1, plan_level_2, 0)
  const directionSum = Math.round((plan_pz + plan_tz + plan_az) * 100) / 100

  if (scope === 'directions') {
    if (plan_level_3 <= 0) {
      return {
        ok: false,
        error: 'Сначала управляющий задаёт уровень 3 (финал) во вкладке «Финансы клуба»',
      }
    }
    if (directionSum <= 0) {
      return { ok: false, error: 'Распределите план по залам ПЗ, ТЗ и АЗ' }
    }
    if (Math.abs(directionSum - plan_level_3) > 0.009) {
      return {
        ok: false,
        error: `Сумма направлений (${formatRub(directionSum)}) должна быть ровно ${formatRub(plan_level_3)} — финал уровня 3`,
      }
    }
  } else if (scope === 'all' && plan_total > 0 && directionSum > 0 && Math.abs(directionSum - plan_total) > 0.009) {
    return {
      ok: false,
      error: `План по направлениям (${formatRub(directionSum)}) должен совпадать с уровнем 3 — финалом (${formatRub(plan_total)})`,
    }
  }

  return {
    ok: true,
    payload: {
      plan_total: Math.round(plan_total * 100) / 100,
      plan_level_1,
      plan_level_2,
      plan_level_3,
      plan_pz,
      plan_tz,
      plan_az,
    },
  }
}



/** @param {Record<string, string>} form */

export function expenseFormToPayload(form) {

  const amount = parseSalesMoney(form.expense_month)

  if (Number.isNaN(amount)) return { ok: false, error: 'Расход: неотрицательная сумма' }

  return { ok: true, payload: { amount } }

}



export function emptyPlanForm() {
  return {
    plan_level_1: '',
    plan_level_2: '',
    plan_level_3: '',
    plan_pz: '',
    plan_tz: '',
    plan_az: '',
  }
}



export function planRowToForm(row) {
  const f = emptyPlanForm()
  if (!row) return f
  const src = {
    ...row,
    plan_level_1: row.plan_level_1 ?? row.plan_nk,
    plan_level_2: row.plan_level_2 ?? row.plan_dk,
    plan_level_3: row.plan_level_3 ?? row.plan_uk,
  }
  for (const k of Object.keys(f)) {
    const v = src[k]
    f[k] = v == null || v === '' ? '' : String(v)
  }
  return f
}



export function emptyExpenseForm() {

  return { expense_month: '' }

}



export function expenseRowToForm(row) {

  if (!row || row.amount == null) return emptyExpenseForm()

  return { expense_month: String(row.amount) }

}


