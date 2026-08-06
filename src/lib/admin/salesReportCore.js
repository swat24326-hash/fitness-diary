/** Чистая логика отчётов продаж (без React / IDB). */



import { resolveTrainingsMatrixForPersist, sumMatrixRows } from './salesTrainingsMatrix.js'
import { aerobicInputMapToRows } from './aerobicSalesMatrix.js'



export const SALES_MATRIX_HALL_ROWS = [

  { key: 'pz', label: 'ПЗ' },

  { key: 'tz', label: 'ТЗ' },

  { key: 'az', label: 'АЗ' },

]



export const SALES_DOP_ROW = { key: 'dop', label: 'Доп. продажи' }



/** ПЗ/ТЗ/АЗ (матрица НК/ДК/УК) + доп. продажи (одна сумма, без разнесения). */

export const SALES_MATRIX_ROWS = [...SALES_MATRIX_HALL_ROWS, SALES_DOP_ROW]



/** Поле формы: сумма доп. продаж за день (₽). */

export const SALES_DOP_FORM_SUM_KEY = 'dop_sum'

/** Поле формы: возвраты за день (₽, расход клуба). */
export const SALES_REFUNDS_FORM_KEY = 'refunds_amount'



/** Ключ в matrix_amounts: сумма доп. продаж (₽). */

export const SALES_DOP_AMOUNT_KEY = 'dop_total'



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

  'dop_nk',

  'dop_dk',

  'dop_uk',

]



export const SALES_MATRIX_HALL_KEYS = SALES_MATRIX_KEYS.filter((k) => !k.startsWith('dop_'))

/** Месячный SELECT без refunds_amount (колонка может быть не применена). */
export const SALES_MONTH_DAILY_SELECT_WITHOUT_REFUNDS = [
  'report_date',
  'profit_nk',
  'profit_dk',
  'profit_uk',
  'profit_day',
  'pnk_total',
  'trainings_count',
  'trainings_matrix',
  'aerobic_sales_matrix',
  'matrix_amounts',
  ...SALES_MATRIX_KEYS,
].join(', ')

/** Поля club_sales_daily для агрегации месяца (статистика, матрица 3×3). */
export const SALES_MONTH_DAILY_SELECT = [
  'report_date',
  'profit_nk',
  'profit_dk',
  'profit_uk',
  'profit_day',
  'pnk_total',
  'trainings_count',
  'trainings_matrix',
  'aerobic_sales_matrix',
  'matrix_amounts',
  'refunds_amount',
  ...SALES_MATRIX_KEYS,
].join(', ')

/** @param {Array<Record<string, unknown>>} rows */
export function sumMatrixTotalsFromDailyRows(rows) {
  const totals = { pz: 0, tz: 0, az: 0, dop: 0, all: 0 }
  for (const row of rows ?? []) {
    for (const key of SALES_MATRIX_KEYS) {
      const n = Math.trunc(Number(row[key]) || 0)
      totals.all += n
      if (key.startsWith('pz_')) totals.pz += n
      else if (key.startsWith('tz_')) totals.tz += n
      else if (key.startsWith('az_')) totals.az += n
      else if (key.startsWith('dop_')) totals.dop += n
    }
  }
  return totals
}

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

  for (const row of SALES_MATRIX_HALL_ROWS) {

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



  for (const row of SALES_MATRIX_HALL_ROWS) {

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



  let profitDop = 0

  const dopRaw = form[SALES_DOP_FORM_SUM_KEY]

  if (dopRaw != null && dopRaw !== '') {

    const dopSum = parseSalesMoney(dopRaw)

    if (Number.isNaN(dopSum) || dopSum < 0) {

      return { ok: false, error: 'Доп. продажи: сумма ≥ 0' }

    }

    profitDop = Math.round(dopSum * 100) / 100

  }



  const profitDayBase = computeProfitDay(profit.profit_nk, profit.profit_dk, profit.profit_uk)

  let refunds = 0
  const refundsRaw = form[SALES_REFUNDS_FORM_KEY]
  if (refundsRaw != null && refundsRaw !== '') {
    const refundsSum = parseSalesMoney(refundsRaw)
    if (Number.isNaN(refundsSum) || refundsSum < 0) {
      return { ok: false, error: 'Возвраты: сумма ≥ 0' }
    }
    refunds = Math.round(refundsSum * 100) / 100
  }

  const profitDayGross = Math.round((profitDayBase + profitDop) * 100) / 100

  return {

    ok: true,

    ...profit,

    profit_dop: profitDop,

    refunds_amount: refunds,

    profit_day_gross: profitDayGross,

    profit_day: Math.round((profitDayGross - refunds) * 100) / 100,

  }

}



/** @param {Record<string, string>} form */

export function buildMatrixAmountsPayload(form) {

  const amounts = {}

  for (const key of SALES_MATRIX_HALL_KEYS) {

    const sumKey = salesMatrixSumKey(key)

    const raw = form[sumKey]

    if (raw == null || raw === '') continue

    const sum = parseSalesMoney(raw)

    if (Number.isNaN(sum)) return { ok: false, error: 'Матрица: суммы ≥ 0' }

    if (sum > 0) amounts[key] = sum

  }



  const dopRaw = form[SALES_DOP_FORM_SUM_KEY]

  if (dopRaw != null && dopRaw !== '') {

    const sum = parseSalesMoney(dopRaw)

    if (Number.isNaN(sum) || sum < 0) return { ok: false, error: 'Доп. продажи: сумма ≥ 0' }

    if (sum > 0) amounts[SALES_DOP_AMOUNT_KEY] = Math.round(sum * 100) / 100

  }



  return { ok: true, matrix_amounts: amounts }

}



/** @param {unknown} raw */

export function matrixAmountsFromDb(raw) {

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const out = {}

  for (const key of SALES_MATRIX_HALL_KEYS) {

    const v = raw[key]

    if (v == null || v === '') continue

    const n = parseSalesMoney(v)

    if (!Number.isNaN(n) && n > 0) out[key] = n

  }

  return out

}



/** @param {unknown} raw matrix_amounts из БД */

export function dopAmountFromMatrixAmounts(raw) {

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0

  const direct = parseSalesMoney(raw[SALES_DOP_AMOUNT_KEY])

  if (!Number.isNaN(direct) && direct > 0) return Math.round(direct * 100) / 100

  let legacy = 0

  for (const suffix of ['nk', 'dk', 'uk']) {

    const n = parseSalesMoney(raw[`dop_${suffix}`])

    if (!Number.isNaN(n) && n > 0) legacy += n

  }

  return Math.round(legacy * 100) / 100

}



/** @param {Record<string, unknown> | null | undefined} row */

export function dopRubFromDailyRow(row) {

  return dopAmountFromMatrixAmounts(row?.matrix_amounts)

}



/** @param {Array<Record<string, unknown>>} rows */

export function sumDopRubFromDailyRows(rows) {

  let total = 0

  for (const r of rows ?? []) total += dopRubFromDailyRow(r)

  return Math.round(total * 100) / 100

}



/** @param {Record<string, string>} f @param {Record<string, unknown> | null | undefined} row */

function hydrateMatrixSums(f, row) {

  const stored = matrixAmountsFromDb(row?.matrix_amounts)

  if (Object.keys(stored).length) {

    for (const key of SALES_MATRIX_HALL_KEYS) {

      const sum = stored[key]

      f[salesMatrixSumKey(key)] = sum != null ? String(sum) : ''

    }

    const dopRub = dopAmountFromMatrixAmounts(row?.matrix_amounts)

    f[SALES_DOP_FORM_SUM_KEY] = dopRub > 0 ? String(dopRub) : ''

    const refunds = refundsFromDailyRow(row)
    f[SALES_REFUNDS_FORM_KEY] = refunds > 0 ? String(refunds) : ''

    return f

  }



  for (const col of SALES_MATRIX_COLS) {

    const colProfit = parseSalesMoney(row?.[`profit_${col.suffix}`]) || 0

    const colTotal = salesMatrixColumnTotals(f)[col.suffix]

    if (colTotal <= 0 || colProfit <= 0) continue

    for (const matrixRow of SALES_MATRIX_HALL_ROWS) {

      const countKey = `${matrixRow.key}_${col.suffix}`

      const count = parseSalesCount(f[countKey]) || 0

      if (count <= 0) continue

      const sum = Math.round(((colProfit * count) / colTotal) * 100) / 100

      f[salesMatrixSumKey(countKey)] = String(sum)

    }

  }

  const dopRub = dopRubFromDailyRow(row)

  f[SALES_DOP_FORM_SUM_KEY] = dopRub > 0 ? String(dopRub) : ''

  const refunds = refundsFromDailyRow(row)
  f[SALES_REFUNDS_FORM_KEY] = refunds > 0 ? String(refunds) : ''

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

/** @param {Record<string, unknown> | null | undefined} row */
export function refundsFromDailyRow(row) {
  return Math.round((Number(row?.refunds_amount) || 0) * 100) / 100
}

/** @param {Record<string, unknown> | null | undefined} row */
export function resolveDailyProfitFromRow(row) {
  const nk = Number(row?.profit_nk) || 0
  const dk = Number(row?.profit_dk) || 0
  const uk = Number(row?.profit_uk) || 0
  const gross = Math.round((computeProfitDay(nk, dk, uk) + dopRubFromDailyRow(row)) * 100) / 100
  const refunds = refundsFromDailyRow(row)
  return {
    gross,
    refunds,
    net: Math.round((gross - refunds) * 100) / 100,
  }
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

/** Факт для плана и уровней — валовая выручка месяца; возвраты не уменьшают план. */
export function resolvePlanFactFromMonthSummary(summary) {
  const gross = Number(summary?.profitGrossTotal)
  if (Number.isFinite(gross)) return Math.round(gross * 100) / 100
  return Math.round((Number(summary?.profitTotal) || 0) * 100) / 100
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

  f[SALES_DOP_FORM_SUM_KEY] = ''

  f[SALES_REFUNDS_FORM_KEY] = ''

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

 * @param {{ trainerIds?: string[], membershipTypes?: object[], matrixInput?: Record<string, string>, aerobicMatrixInput?: Record<string, string>, aerobicMembershipTypes?: object[] } | null} opts

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

  const { profit_nk, profit_dk, profit_uk, refunds_amount } = profitCalc



  const pnk_total = parseSalesCount(form.pnk_total)

  if (Number.isNaN(pnk_total)) {

    return { ok: false, error: 'ПНК: целое число ≥ 0' }

  }



  let trainings_count

  let trainings_matrix = []



  if (opts?.matrixInput && Array.isArray(opts.trainerIds)) {

    const trainerTypes = (opts.membershipTypes ?? []).filter((t) => t?.trainer_assignable !== false)

    const clubTrainerIds = opts.trainerIds
      .map((id) => String(id ?? '').trim())
      .filter((id) => id && id !== '__club__')

    const resolved = resolveTrainingsMatrixForPersist(
      opts.matrixInput,
      clubTrainerIds.length ? clubTrainerIds : opts.trainerIds,
      trainerTypes,
    )

    if (!resolved.ok) return resolved

    trainings_matrix = resolved.rows

    trainings_count = sumMatrixRows(trainings_matrix)

  } else {

    trainings_count = parseSalesCount(form.trainings_count)

    if (Number.isNaN(trainings_count)) {

      return { ok: false, error: 'Тренировки: целое число ≥ 0' }

    }

  }



  let aerobic_sales_matrix = []

  if (opts?.aerobicMatrixInput) {

    const parsedAerobic = aerobicInputMapToRows(

      opts.aerobicMatrixInput,

      opts.aerobicMembershipTypes ?? [],

    )

    if (!parsedAerobic.ok) return parsedAerobic

    aerobic_sales_matrix = parsedAerobic.rows

  }



  const payload = {

    profit_nk,

    profit_dk,

    profit_uk,

    refunds_amount,

    pnk_total,

    trainings_count,

    trainings_matrix,

    aerobic_sales_matrix,

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

  let profitGrossTotal = 0

  let refundsTotal = 0

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

    const { gross, refunds, net } = resolveDailyProfitFromRow(r)

    profitGrossTotal += gross

    refundsTotal += refunds

    profitTotal += net

    trainingsTotal += Number(r.trainings_count) || 0

    dayCount += 1

  }

  return {

    profitNk: Math.round(profitNk * 100) / 100,

    profitDk: Math.round(profitDk * 100) / 100,

    profitUk: Math.round(profitUk * 100) / 100,

    profitGrossTotal: Math.round(profitGrossTotal * 100) / 100,

    refundsTotal: Math.round(refundsTotal * 100) / 100,

    profitTotal: Math.round(profitTotal * 100) / 100,

    trainingsTotal,

    dayCount,

  }

}



export const PLAN_LEVEL_KEYS = ['plan_level_1', 'plan_level_2', 'plan_level_3']

export const PLAN_DIRECTION_KEYS = ['plan_pz', 'plan_tz', 'plan_az', 'plan_extra']

/** Направления залов для плана и факта (₽ из matrix_amounts). */
export const SALES_DIRECTION_DEFS = [
  { key: 'pz', label: 'ПЗ', planKey: 'plan_pz' },
  { key: 'tz', label: 'ТЗ', planKey: 'plan_tz' },
  { key: 'az', label: 'АЗ', planKey: 'plan_az' },
  { key: 'extra', label: 'Доп. продажи', planKey: 'plan_extra' },
]

/** @param {Array<Record<string, unknown>>} rows */
export function sumMatrix3x3AmountsFromDailyRows(rows) {
  /** @type {Record<string, number>} */
  const grid = {}
  for (const row of SALES_MATRIX_HALL_ROWS) {
    for (const col of SALES_MATRIX_COLS) {
      grid[`${row.key}_${col.suffix}`] = 0
    }
  }
  for (const r of rows ?? []) {
    const amounts = matrixAmountsFromDb(r?.matrix_amounts)
    for (const key of Object.keys(grid)) {
      grid[key] += Number(amounts[key]) || 0
    }
  }
  for (const key of Object.keys(grid)) {
    grid[key] = Math.round(grid[key] * 100) / 100
  }
  return grid
}

/** @param {Array<Record<string, unknown>>} rows */
export function sumDirectionRubFromDailyRows(rows) {
  const cellAmounts = sumMatrix3x3AmountsFromDailyRows(rows)
  /** @type {Record<string, number>} */
  const totals = { pz: 0, tz: 0, az: 0, extra: 0 }
  for (const hall of ['pz', 'tz', 'az']) {
    for (const suffix of ['nk', 'dk', 'uk']) {
      totals[hall] += Number(cellAmounts[`${hall}_${suffix}`]) || 0
    }
  }
  for (const r of rows ?? []) {
    totals.extra += dopAmountFromMatrixAmounts(r?.matrix_amounts)
  }
  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key] * 100) / 100
  }
  return totals
}

/**
 * @param {{ profitNk?: number, profitDk?: number, profitUk?: number, profitTotal?: number }} summary
 * @param {number} dopRub
 */
export function buildCategoryStructure(summary, dopRub) {
  const shareBase = resolvePlanFactFromMonthSummary(summary)
  const items = [
    { key: 'nk', label: 'НК', amount: Number(summary?.profitNk) || 0 },
    { key: 'dk', label: 'ДК', amount: Number(summary?.profitDk) || 0 },
    { key: 'uk', label: 'УК', amount: Number(summary?.profitUk) || 0 },
    { key: 'dop', label: 'Доп. продажи', amount: Number(dopRub) || 0 },
  ]
  return items.map((item) => ({
    ...item,
    amount: Math.round(item.amount * 100) / 100,
    sharePercent: shareBase > 0 ? Math.round((item.amount / shareBase) * 1000) / 10 : 0,
  }))
}

/**
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {Record<string, number>} planDirections plan_pz, plan_tz, plan_az, plan_extra
 * @param {number} profitTotal
 */
/**
 * Чистая прибыль зала: выручка направления (ПЗ/АЗ из matrix_amounts) − ЗП зала.
 * @param {Array<Record<string, unknown>>} monthRows
 * @param {number} trainerPayroll ЗП персонального зала за месяц
 * @param {number} aerobicPayroll ЗП аэробного зала за месяц
 */
export function buildHallFinanceSummary(monthRows, trainerPayroll, aerobicPayroll) {
  const rub = sumDirectionRubFromDailyRows(monthRows)
  const trainerPay = Math.round((Number(trainerPayroll) || 0) * 100) / 100
  const aerobicPay = Math.round((Number(aerobicPayroll) || 0) * 100) / 100
  return {
    pz: {
      revenue: rub.pz,
      payroll: trainerPay,
      netProfit: Math.round((rub.pz - trainerPay) * 100) / 100,
    },
    tz: {
      revenue: rub.tz,
    },
    az: {
      revenue: rub.az,
      payroll: aerobicPay,
      netProfit: Math.round((rub.az - aerobicPay) * 100) / 100,
    },
  }
}

export function buildDirectionStructure(monthRows, planDirections, shareBase) {
  const rub = sumDirectionRubFromDailyRows(monthRows)
  const base = Number(shareBase) || 0
  return SALES_DIRECTION_DEFS.map(({ key, label, planKey }) => {
    const amount = rub[key] || 0
    const planTarget = Number(planDirections?.[planKey]) || 0
    return {
      key,
      label,
      amount,
      planTarget,
      sharePercent: base > 0 ? Math.round((amount / base) * 1000) / 10 : 0,
      planProgressPercent: planProgressPercent(amount, planTarget),
    }
  })
}

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

export {
  evaluatePlanDirectionsFormExtended as evaluatePlanDirectionsForm,
  planMatrixFormToPayload as planFormToPayload,
} from './salesPlanMatrixCore.js'

export {
  emptyExpenseForm,
  expenseFormToPayload,
  expenseRowToForm,
  patchExpenseFormPart,
  sumExpenseParts,
  SUPERVISOR_EXPENSE_PART_KEYS,
  SUPERVISOR_EXPENSE_PART_LABELS,
  SUPERVISOR_EXPENSE_SELECT_COLS,
} from './supervisorExpenseCore.js'

export function emptyPlanForm() {
  /** @type {Record<string, string>} */
  const matrix = {}
  for (const row of SALES_MATRIX_HALL_ROWS) {
    for (const col of SALES_MATRIX_COLS) {
      const cellKey = `${row.key}_${col.suffix}`
      matrix[`plan_${cellKey}_count`] = ''
      matrix[`plan_${cellKey}_avg`] = ''
    }
  }
  return {
    plan_level_1: '',
    plan_level_2: '',
    plan_level_3: '',
    plan_pz: '',
    plan_tz: '',
    plan_az: '',
    plan_extra: '',
    ...matrix,
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
  for (const k of ['plan_level_1', 'plan_level_2', 'plan_level_3', 'plan_pz', 'plan_tz', 'plan_az', 'plan_extra']) {
    const v = src[k]
    f[k] = v == null || v === '' ? '' : String(v)
  }
  const rawMatrix = row.plan_matrix
  if (rawMatrix && typeof rawMatrix === 'object' && !Array.isArray(rawMatrix)) {
    for (const rowDef of SALES_MATRIX_HALL_ROWS) {
      for (const col of SALES_MATRIX_COLS) {
        const cellKey = `${rowDef.key}_${col.suffix}`
        const cell = /** @type {{ count?: unknown, avg_check?: unknown }} */ (rawMatrix[cellKey])
        const count = Math.trunc(Number(cell?.count) || 0)
        const avg = Number(cell?.avg_check) || 0
        if (count > 0 && avg > 0) {
          f[`plan_${cellKey}_count`] = String(count)
          f[`plan_${cellKey}_avg`] = String(avg)
        }
      }
    }
  }
  return f
}
