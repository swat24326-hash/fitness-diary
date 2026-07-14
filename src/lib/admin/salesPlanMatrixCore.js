/** План по ячейкам матрицы НК/ДК/УК × ПЗ/ТЗ/АЗ — чистая логика (без React / IDB). */

const SALES_MATRIX_HALL_ROWS = [
  { key: 'pz', label: 'ПЗ' },
  { key: 'tz', label: 'ТЗ' },
  { key: 'az', label: 'АЗ' },
]

const SALES_MATRIX_COLS = [
  { suffix: 'nk', label: 'НК' },
  { suffix: 'dk', label: 'ДК' },
  { suffix: 'uk', label: 'УК' },
]

const MONEY_EPS = 0.009

function parseSalesMoney(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
  if (!s) return 0
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return NaN
  return Math.round(n * 100) / 100
}

function parseSalesCount(raw) {
  const s = String(raw ?? '').trim().replace(/\s/g, '')
  if (!s) return 0
  const n = Math.floor(Number(s.replace(',', '.')))
  if (!Number.isFinite(n) || n < 0) return NaN
  return n
}

function formatRub(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₽`
}

export const PLAN_MATRIX_HALL_CELL_KEYS = SALES_MATRIX_HALL_ROWS.flatMap((row) =>
  SALES_MATRIX_COLS.map((col) => `${row.key}_${col.suffix}`),
)

/** @param {string} cellKey e.g. pz_nk */
export function planMatrixCountField(cellKey) {
  return `plan_${cellKey}_count`
}

/** @param {string} cellKey */
export function planMatrixAvgField(cellKey) {
  return `plan_${cellKey}_avg`
}

/** @returns {Record<string, string>} */
export function planMatrixEmptyFormFields() {
  /** @type {Record<string, string>} */
  const f = {}
  for (const cellKey of PLAN_MATRIX_HALL_CELL_KEYS) {
    f[planMatrixCountField(cellKey)] = ''
    f[planMatrixAvgField(cellKey)] = ''
  }
  return f
}

export function roundPlanRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** @param {number} count @param {number} avgCheck */
export function planMatrixCellRub(count, avgCheck) {
  const c = Math.trunc(Number(count) || 0)
  const a = Number(avgCheck) || 0
  if (c <= 0 || a <= 0) return 0
  return roundPlanRub(c * a)
}

/** @param {Record<string, string>} form @param {string} cellKey */
export function planMatrixCellRubFromForm(form, cellKey) {
  const count = parseSalesCount(form[planMatrixCountField(cellKey)])
  const avg = parseSalesMoney(form[planMatrixAvgField(cellKey)])
  if (Number.isNaN(count) || Number.isNaN(avg)) return 0
  return planMatrixCellRub(count, avg)
}

/**
 * @param {Record<string, string>} form
 * @param {string} cellKey
 * @param {string} rowLabel
 * @param {string} colLabel
 */
export function validatePlanMatrixCellForm(form, cellKey, rowLabel, colLabel) {
  const countRaw = form[planMatrixCountField(cellKey)]
  const avgRaw = form[planMatrixAvgField(cellKey)]
  const hasCount = countRaw != null && countRaw !== ''
  const hasAvg = avgRaw != null && avgRaw !== ''
  if (!hasCount && !hasAvg) return { ok: true, empty: true }

  const count = parseSalesCount(countRaw)
  const avg = parseSalesMoney(avgRaw)
  if (Number.isNaN(count) || Number.isNaN(avg)) {
    return { ok: false, error: `${rowLabel} ${colLabel}: некорректные числа` }
  }
  if (count < 0 || avg < 0) {
    return { ok: false, error: `${rowLabel} ${colLabel}: неотрицательные значения` }
  }
  if (hasCount !== hasAvg || (count > 0 && avg <= 0) || (count <= 0 && avg > 0)) {
    return { ok: false, error: `${rowLabel} ${colLabel}: укажите количество и средний чек` }
  }
  return { ok: true, empty: count <= 0, count, avg_check: avg }
}

/** @param {Record<string, string>} form @param {string} cellKey */
export function readPlanMatrixCellFromForm(form, cellKey) {
  const v = validatePlanMatrixCellForm(form, cellKey, '', '')
  if (!v.ok || v.empty) return { count: 0, avg_check: 0, amount: 0 }
  return {
    count: v.count,
    avg_check: v.avg_check,
    amount: planMatrixCellRub(v.count, v.avg_check),
  }
}

/** @param {Record<string, string>} form @param {'pz'|'tz'|'az'} hallKey */
export function sumPlanMatrixHallFromForm(form, hallKey) {
  let count = 0
  let amount = 0
  for (const col of SALES_MATRIX_COLS) {
    const cell = readPlanMatrixCellFromForm(form, `${hallKey}_${col.suffix}`)
    count += cell.count
    amount += cell.amount
  }
  amount = roundPlanRub(amount)
  const avg_check = count > 0 && amount > 0 ? roundPlanRub(amount / count) : 0
  return { count, amount, avg_check }
}

/** @param {Record<string, string>} form */
export function hasPlanMatrixInForm(form) {
  for (const cellKey of PLAN_MATRIX_HALL_CELL_KEYS) {
    const countRaw = form[planMatrixCountField(cellKey)]
    const avgRaw = form[planMatrixAvgField(cellKey)]
    if ((countRaw != null && countRaw !== '') || (avgRaw != null && avgRaw !== '')) return true
  }
  return false
}

/** @param {unknown} planMatrix */
export function hasPlanMatrixData(planMatrix) {
  const norm = normalizePlanMatrixFromDb(planMatrix)
  return Object.keys(norm).length > 0
}

/** @param {unknown} raw */
export function normalizePlanMatrixFromDb(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  /** @type {Record<string, { count: number, avg_check: number }>} */
  const out = {}
  for (const cellKey of PLAN_MATRIX_HALL_CELL_KEYS) {
    const cell = /** @type {{ count?: unknown, avg_check?: unknown }} */ (src[cellKey])
    const count = Math.trunc(Number(cell?.count) || 0)
    const avg = roundPlanRub(Number(cell?.avg_check) || 0)
    if (count > 0 && avg > 0) {
      out[cellKey] = { count, avg_check: avg }
    }
  }
  return out
}

/** @param {unknown} planMatrix */
export function planMatrixToFormFields(planMatrix) {
  const f = planMatrixEmptyFormFields()
  const norm = normalizePlanMatrixFromDb(planMatrix)
  for (const [cellKey, cell] of Object.entries(norm)) {
    f[planMatrixCountField(cellKey)] = String(cell.count)
    f[planMatrixAvgField(cellKey)] = String(cell.avg_check)
  }
  return f
}

/** @param {Record<string, string>} form */
export function buildPlanMatrixJsonFromForm(form) {
  /** @type {Record<string, { count: number, avg_check: number }>} */
  const matrix = {}
  for (const row of SALES_MATRIX_HALL_ROWS) {
    for (const col of SALES_MATRIX_COLS) {
      const cellKey = `${row.key}_${col.suffix}`
      const v = validatePlanMatrixCellForm(form, cellKey, row.label, col.label)
      if (!v.ok) return { ok: false, error: v.error }
      if (!v.empty) {
        matrix[cellKey] = { count: v.count, avg_check: v.avg_check }
      }
    }
  }
  return { ok: true, plan_matrix: matrix }
}

/** @param {Record<string, string>} form */
export function computePlanDirectionsFromForm(form) {
  const plan_extra = parseSalesMoney(form.plan_extra)
  const extra = Number.isNaN(plan_extra) ? 0 : roundPlanRub(plan_extra)

  if (hasPlanMatrixInForm(form)) {
    const pz = sumPlanMatrixHallFromForm(form, 'pz')
    const tz = sumPlanMatrixHallFromForm(form, 'tz')
    const az = sumPlanMatrixHallFromForm(form, 'az')
    return {
      plan_pz: pz.amount,
      plan_tz: tz.amount,
      plan_az: az.amount,
      plan_extra: extra,
    }
  }

  const plan_pz = parseSalesMoney(form.plan_pz)
  const plan_tz = parseSalesMoney(form.plan_tz)
  const plan_az = parseSalesMoney(form.plan_az)
  return {
    plan_pz: Number.isNaN(plan_pz) ? 0 : roundPlanRub(plan_pz),
    plan_tz: Number.isNaN(plan_tz) ? 0 : roundPlanRub(plan_tz),
    plan_az: Number.isNaN(plan_az) ? 0 : roundPlanRub(plan_az),
    plan_extra: extra,
  }
}

/** @param {Record<string, string>} form */
export function evaluatePlanDirectionsFormExtended(form) {
  const plan_level_3 = parseSalesMoney(form.plan_level_3)
  const plan_extra = parseSalesMoney(form.plan_extra)
  const finalTarget = Number.isNaN(plan_level_3) ? 0 : roundPlanRub(plan_level_3)
  const noFinal = finalTarget <= 0

  for (const row of SALES_MATRIX_HALL_ROWS) {
    for (const col of SALES_MATRIX_COLS) {
      const cellKey = `${row.key}_${col.suffix}`
      const v = validatePlanMatrixCellForm(form, cellKey, row.label, col.label)
      if (!v.ok) {
        return {
          invalid: true,
          error: v.error,
          finalTarget,
          directionSum: 0,
          noFinal,
          meetsMinimum: false,
          exactMatch: false,
          directionsBelow: false,
          shortfall: 0,
          surplus: 0,
          canSave: false,
          hasMatrix: false,
          hallTotals: { pz: { count: 0, amount: 0 }, tz: { count: 0, amount: 0 }, az: { count: 0, amount: 0 } },
          planDirections: { plan_pz: 0, plan_tz: 0, plan_az: 0, plan_extra: 0 },
        }
      }
    }
  }

  if (Number.isNaN(plan_extra) || plan_extra < 0) {
    return {
      invalid: true,
      error: 'Доп. продажи: неотрицательная сумма',
      finalTarget,
      directionSum: 0,
      noFinal,
      meetsMinimum: false,
      exactMatch: false,
      directionsBelow: false,
      shortfall: 0,
      surplus: 0,
      canSave: false,
      hasMatrix: false,
      hallTotals: { pz: { count: 0, amount: 0 }, tz: { count: 0, amount: 0 }, az: { count: 0, amount: 0 } },
      planDirections: { plan_pz: 0, plan_tz: 0, plan_az: 0, plan_extra: 0 },
    }
  }

  const dirs = computePlanDirectionsFromForm(form)
  const directionSum = roundPlanRub(dirs.plan_pz + dirs.plan_tz + dirs.plan_az + dirs.plan_extra)
  const meetsMinimum = !noFinal && directionSum >= finalTarget - MONEY_EPS
  const shortfall = noFinal ? 0 : roundPlanRub(Math.max(0, finalTarget - directionSum))
  const surplus = noFinal ? 0 : roundPlanRub(Math.max(0, directionSum - finalTarget))
  const hasMatrix = hasPlanMatrixInForm(form)
  const hasAnyDirection = directionSum > 0

  return {
    invalid: false,
    error: '',
    finalTarget,
    directionSum,
    noFinal,
    meetsMinimum,
    exactMatch: Math.abs(directionSum - finalTarget) <= MONEY_EPS,
    directionsBelow: !noFinal && directionSum > 0 && !meetsMinimum,
    directionsMismatch: !noFinal && directionSum > 0 && !meetsMinimum,
    shortfall,
    surplus,
    canSave: !noFinal && meetsMinimum && hasAnyDirection && hasMatrix,
    hasMatrix,
    hallTotals: {
      pz: sumPlanMatrixHallFromForm(form, 'pz'),
      tz: sumPlanMatrixHallFromForm(form, 'tz'),
      az: sumPlanMatrixHallFromForm(form, 'az'),
    },
    planDirections: dirs,
  }
}

/**
 * @param {Record<string, string>} form
 * @param {{ scope?: 'all' | 'levels' | 'directions' }} [opts]
 */
export function planMatrixFormToPayload(form, opts = {}) {
  const scope = opts.scope ?? 'all'
  const plan_level_1 = parseSalesMoney(form.plan_level_1)
  const plan_level_2 = parseSalesMoney(form.plan_level_2)
  const plan_level_3 = parseSalesMoney(form.plan_level_3)

  if ([plan_level_1, plan_level_2, plan_level_3].some((n) => Number.isNaN(n))) {
    return { ok: false, error: 'План: неотрицательные суммы уровней' }
  }

  if (scope === 'levels' || scope === 'all') {
    if (plan_level_1 > 0 && plan_level_2 > 0 && plan_level_2 + MONEY_EPS < plan_level_1) {
      return { ok: false, error: 'Уровень 2 не может быть ниже уровня 1' }
    }
    if (plan_level_2 > 0 && plan_level_3 > 0 && plan_level_3 + MONEY_EPS < plan_level_2) {
      return { ok: false, error: 'Уровень 3 (финал) не может быть ниже уровня 2' }
    }
    if (plan_level_1 > 0 && plan_level_3 > 0 && plan_level_2 <= 0 && plan_level_3 + MONEY_EPS < plan_level_1) {
      return { ok: false, error: 'Уровень 3 не может быть ниже уровня 1' }
    }
  }

  const plan_total = plan_level_3 > 0 ? plan_level_3 : Math.max(plan_level_1, plan_level_2, 0)

  if (scope === 'levels') {
    return {
      ok: true,
      payload: {
        plan_total: roundPlanRub(plan_total),
        plan_level_1,
        plan_level_2,
        plan_level_3,
      },
    }
  }

  const evaluated = evaluatePlanDirectionsFormExtended(form)
  if (evaluated.invalid) {
    return { ok: false, error: evaluated.error }
  }

  if (scope === 'directions') {
    if (plan_level_3 <= 0) {
      return {
        ok: false,
        error: 'Сначала управляющий задаёт уровень 3 (финал) во вкладке «Финансы клуба»',
      }
    }
    if (!evaluated.hasMatrix) {
      return { ok: false, error: 'Заполните план по ячейкам: количество и средний чек' }
    }
    if (evaluated.directionSum <= 0) {
      return { ok: false, error: 'Распределите план по залам и доп. продажам' }
    }
    if (!evaluated.meetsMinimum) {
      return {
        ok: false,
        error: `Сумма направлений (${formatRub(evaluated.directionSum)}) должна быть не меньше финала ${formatRub(plan_level_3)} — не хватает ${formatRub(evaluated.shortfall)}`,
      }
    }
  } else if (scope === 'all' && plan_total > 0 && evaluated.directionSum > 0 && !evaluated.meetsMinimum) {
    return {
      ok: false,
      error: `План по направлениям (${formatRub(evaluated.directionSum)}) должен быть не меньше финала (${formatRub(plan_total)})`,
    }
  }

  const matrixBuilt = buildPlanMatrixJsonFromForm(form)
  if (!matrixBuilt.ok) {
    return { ok: false, error: matrixBuilt.error }
  }

  const dirs = evaluated.planDirections

  return {
    ok: true,
    payload: {
      plan_total: roundPlanRub(plan_total),
      plan_level_1,
      plan_level_2,
      plan_level_3,
      plan_pz: dirs.plan_pz,
      plan_tz: dirs.plan_tz,
      plan_az: dirs.plan_az,
      plan_extra: dirs.plan_extra,
      plan_matrix: matrixBuilt.plan_matrix,
    },
  }
}
