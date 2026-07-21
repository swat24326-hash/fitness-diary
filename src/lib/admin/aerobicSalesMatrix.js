/** Матрица продаж аэробного зала в отчёте: тип абонемента × количество (без НК/ДК/УК). */

export function aerobicSalesCellKey(typeId) {
  return String(typeId ?? '').trim()
}

/** @param {Array<{ membership_type_id?: string, count?: number }>} rows */
export function aerobicRowsToInputMap(rows) {
  const map = {}
  for (const row of rows ?? []) {
    const typeId = String(row?.membership_type_id ?? '').trim()
    if (!typeId) continue
    map[aerobicSalesCellKey(typeId)] = String(Math.trunc(Number(row?.count) || 0))
  }
  return map
}

/**
 * @param {Record<string, string>} inputMap
 * @param {Array<{ id: string }>} membershipTypes active aerobic types only
 */
export function aerobicInputMapToRows(inputMap, membershipTypes) {
  const rows = []
  for (const t of membershipTypes ?? []) {
    const typeId = String(t?.id ?? '').trim()
    if (!typeId) continue
    const raw = inputMap?.[aerobicSalesCellKey(typeId)]
    if (raw == null || raw === '') continue
    const count = Math.floor(Number(String(raw).replace(/\s/g, '').replace(',', '.')))
    if (!Number.isFinite(count) || count < 0) {
      return { ok: false, error: 'Аэробный зал: целые числа ≥ 0' }
    }
    if (count === 0) continue
    rows.push({ membership_type_id: typeId, count })
  }
  return { ok: true, rows }
}

/** @param {unknown} raw */
export function normalizeAerobicRowsFromDb(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => ({
      membership_type_id: String(row?.membership_type_id ?? '').trim(),
      count: Math.trunc(Number(row?.count) || 0),
    }))
    .filter((row) => row.membership_type_id && row.count > 0)
}

/**
 * @param {Array<{ id: string, code?: string, sort_order?: number, is_active?: boolean }>} membershipTypes
 * @param {{ includeInactive?: boolean }} [opts]
 */
export function buildAerobicSalesMatrixColumns(membershipTypes, opts = {}) {
  const includeInactive = opts.includeInactive !== false
  return (membershipTypes ?? [])
    .filter((t) => includeInactive || t?.is_active !== false)
    .sort(
      (a, b) =>
        (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0) ||
        String(a?.code ?? '').localeCompare(String(b?.code ?? ''), 'ru'),
    )
    .map((t) => ({
      typeId: String(t.id),
      code: String(t.code ?? '—').trim() || '—',
      inactive: t?.is_active === false,
    }))
}

/** @param {Array<{ count?: number }>} rows */
export function sumAerobicRows(rows) {
  return (rows ?? []).reduce((s, r) => s + (Number(r.count) || 0), 0)
}

/**
 * Сумма тренировок/продаж АЗ за месяц по типам (из aerobic_sales_matrix в отчётах).
 * @param {Array<Record<string, unknown>>} dailyRows
 * @param {Array<{ id: string, code?: string, sort_order?: number, is_active?: boolean }>} membershipTypes
 */
export function aggregateAerobicSalesFromDailyRows(dailyRows, membershipTypes) {
  /** @type {Map<string, number>} */
  const byTypeId = new Map()
  for (const day of dailyRows ?? []) {
    for (const row of normalizeAerobicRowsFromDb(day?.aerobic_sales_matrix)) {
      const id = row.membership_type_id
      byTypeId.set(id, (byTypeId.get(id) || 0) + row.count)
    }
  }
  const columns = buildAerobicSalesMatrixColumns(membershipTypes)
  const byType = columns.map((col) => ({
    typeId: col.typeId,
    code: col.code,
    inactive: col.inactive,
    count: byTypeId.get(col.typeId) || 0,
  }))
  const total = byType.reduce((s, row) => s + row.count, 0)
  return { byType, total }
}

/**
 * Расшифровка АЗ по дням для одного типа (или суммы по всем типам).
 * @param {Array<Record<string, unknown>>} dailyRows
 * @param {string | null} [typeId] — null / '' = сумма по всем типам за день
 * @returns {Array<{ date: string, count: number }>} дни с count > 0, новые сверху
 */
export function buildAerobicTypeDayBreakdown(dailyRows, typeId = null) {
  const wantId = typeId == null || String(typeId).trim() === '' ? null : String(typeId).trim()
  /** @type {Array<{ date: string, count: number }>} */
  const out = []
  for (const day of dailyRows ?? []) {
    const date = String(day?.report_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const rows = normalizeAerobicRowsFromDb(day?.aerobic_sales_matrix)
    let count = 0
    if (wantId == null) {
      count = sumAerobicRows(rows)
    } else {
      for (const row of rows) {
        if (row.membership_type_id === wantId) count += row.count
      }
    }
    if (count > 0) out.push({ date, count })
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return out
}
