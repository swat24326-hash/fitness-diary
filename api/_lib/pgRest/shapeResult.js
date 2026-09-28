const MULTI_ROW = 'JSON object requested, multiple (or no) rows returned'

function rowCountError(count) {
  return {
    data: null,
    error: { message: MULTI_ROW, code: 'PGRST116', details: null, hint: null },
    count,
  }
}

/**
 * Ответ в форме supabase-js: `{ data, error, count }`.
 * @param {object[] | null | undefined} rows
 * @param {{ op?: string, head?: boolean, count?: string | null, single?: string | null, returning?: boolean }} spec
 * @param {number | null} countValue
 */
export function shapePgRestResult(rows, spec, countValue) {
  const count = spec?.count === 'exact' ? Number(countValue ?? 0) : null
  if (spec?.head) return { data: null, error: null, count }
  const write = spec?.op === 'insert' || spec?.op === 'update' || spec?.op === 'delete' || spec?.op === 'upsert'
  if (write && !spec?.returning) return { data: null, error: null, count: null }
  const list = rows ?? []
  if (spec?.single === 'maybeSingle') {
    if (list.length > 1) return rowCountError(count)
    return { data: list[0] ?? null, error: null, count }
  }
  if (spec?.single === 'single') {
    if (list.length !== 1) return rowCountError(count)
    return { data: list[0], error: null, count }
  }
  return { data: list, error: null, count }
}
