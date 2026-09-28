/**
 * Content-Range в формате PostgREST: `0-9/120`; на пустой странице вместо диапазона звёздочка.
 * @param {number | null} offset
 * @param {number} rowCount
 * @param {number | null} total
 */
export function restV1ContentRange(offset, rowCount, total) {
  const start = Number(offset) || 0
  const range = rowCount > 0 ? `${start}-${start + rowCount - 1}` : '*'
  return `${range}/${total == null ? '*' : total}`
}

/**
 * Ответ HTTP из строк базы. Без сети — для verify.
 * @param {{ spec: object, single: boolean }} parsed
 * @param {object[]} rows
 * @param {number | null} count
 * @returns {{ status: number, headers: Record<string, string>, body: unknown }}
 */
export function shapeRestV1Response(parsed, rows, count) {
  const { spec, single } = parsed
  const headers = { 'Content-Range': restV1ContentRange(spec.offset, rows.length, count) }
  const created = spec.op === 'insert' || spec.op === 'upsert'
  if (spec.op !== 'select' && !spec.returning) {
    return { status: created ? 201 : 204, headers, body: undefined }
  }
  if (spec.head) return { status: 200, headers, body: undefined }
  if (single) {
    if (rows.length !== 1) {
      return {
        status: 406,
        headers: {},
        body: {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
          details: `The result contains ${rows.length} rows`,
          hint: null,
        },
      }
    }
    return { status: created ? 201 : 200, headers, body: rows[0] }
  }
  return { status: created ? 201 : 200, headers, body: rows }
}

const PG_STATUS = {
  42501: 403,
  23505: 409,
  23503: 409,
  '42P01': 404,
}

/**
 * Ошибка pg → ответ в духе PostgREST (supabase-js читает code/message/details/hint).
 * @param {{ code?: string, message?: string, detail?: string, hint?: string }} e
 */
export function restV1ErrorFromPg(e) {
  const code = e?.code ? String(e.code) : 'PGRST000'
  return {
    status: PG_STATUS[code] ?? 400,
    body: {
      code,
      message: e?.message || 'Ошибка запроса к базе',
      details: e?.detail ?? null,
      hint: e?.hint ?? null,
    },
  }
}
