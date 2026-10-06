import { pgErrorPublic } from '../dbErrorPublicCore.js'

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

/**
 * Ошибка pg → ответ в духе PostgREST (supabase-js читает code/message/details/hint).
 * Сырые message/detail/hint наружу не идут — их пишет в лог restV1Handler.
 * @param {{ code?: string }} e
 */
export function restV1ErrorFromPg(e) {
  const pub = pgErrorPublic(e)
  return {
    status: pub.status,
    body: { code: pub.code, message: pub.message, details: null, hint: null },
  }
}
