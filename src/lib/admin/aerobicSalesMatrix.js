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
