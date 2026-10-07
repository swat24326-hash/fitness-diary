import { pushPlaceholder } from './bind.js'
import { quoteIdent } from './ident.js'

const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'])

const OP_SQL = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
}

/** Запятые внутри кавычек и скобок не режут список `or()`. */
export function splitTopLevel(input) {
  const s = String(input ?? '')
  const out = []
  let cur = ''
  let depth = 0
  let quote = false
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (quote) {
      cur += ch
      if (ch === '"' && s[i - 1] !== '\\') quote = false
      continue
    }
    if (ch === '"') {
      quote = true
      cur += ch
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur) out.push(cur)
  return out.map((part) => part.trim()).filter(Boolean)
}

function unquote(raw) {
  const s = String(raw ?? '')
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"')
  }
  return s
}

function parseInList(raw) {
  const s = String(raw ?? '').trim()
  const inner = s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s
  if (!inner.trim()) return []
  return splitTopLevel(inner).map(unquote)
}

/**
 * Один атом PostgREST: `col.eq.x`, `col.not.is.null`, `col.in.(a,b)`.
 * @returns {{ op: string, column: string, value: unknown, negate: boolean } | { error: string }}
 */
export function parseOrAtom(part) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\.(not\.)?([a-z]+)\.(.*)$/.exec(String(part ?? '').trim())
  if (!m) return { error: `Не разобран фильтр or: ${part}` }
  const column = m[1]
  const negate = Boolean(m[2])
  const op = m[3]
  if (!OPS.has(op)) return { error: `Фильтр ${op} в or() пока не поддержан` }
  let value = unquote(m[4])
  if (op === 'is') {
    if (value === 'null') value = null
    else if (value === 'true') value = true
    else if (value === 'false') value = false
  } else if (op === 'in') {
    value = parseInList(m[4])
  }
  return { op, column, value, negate }
}

function isSql(columnSql, value) {
  if (value === null || value === 'null') return { sql: `${columnSql} IS NULL` }
  if (value === true || value === 'true') return { sql: `${columnSql} IS TRUE` }
  if (value === false || value === 'false') return { sql: `${columnSql} IS FALSE` }
  return { error: 'is поддерживает только null, true и false' }
}

/**
 * @param {{ op: string, column?: string, value?: unknown, negate?: boolean, expr?: string }} filter
 * @param {unknown[]} values
 * @param {(column: string) => string | null} udtOf
 * @returns {{ sql: string } | { error: string }}
 */
export function compileFilter(filter, values, udtOf) {
  if (filter?.op === 'or') return compileOrExpr(filter.expr, values, udtOf)
  const columnSql = quoteIdent(filter?.column)
  if (!columnSql) return { error: `Недопустимое имя поля: ${filter?.column}` }
  const udt = udtOf?.(filter.column) ?? null
  const built = compareSql(columnSql, filter.op, filter.value, values, udt)
  if (built.error) return built
  if (filter.negate) return { sql: `NOT (${built.sql})` }
  return built
}

function compareSql(columnSql, op, value, values, udt) {
  // Только серверный .contains(): в OPS нет, поэтому /rest/v1 и or() его не принимают.
  if (op === 'cs') return { sql: `${columnSql} @> ${pushPlaceholder(values, value, 'jsonb')}` }
  if (!OPS.has(op)) return { error: `Фильтр ${op} пока не поддержан` }
  if (op === 'is') return isSql(columnSql, value)
  if (op === 'in') {
    const list = Array.isArray(value) ? value : []
    if (!list.length) return { sql: 'FALSE' }
    const ph = list.map((item) => pushPlaceholder(values, item, udt))
    return { sql: `${columnSql} IN (${ph.join(', ')})` }
  }
  if ((op === 'eq' || op === 'neq') && (value === null || value === undefined)) {
    return { sql: op === 'eq' ? `${columnSql} IS NULL` : `${columnSql} IS NOT NULL` }
  }
  const ph = pushPlaceholder(values, value, udt)
  return { sql: `${columnSql} ${OP_SQL[op]} ${ph}` }
}

function compileOrExpr(expr, values, udtOf) {
  const parts = splitTopLevel(expr)
  if (!parts.length) return { error: 'Пустой or()' }
  const sqls = []
  for (const part of parts) {
    const atom = parseOrAtom(part)
    if (atom.error) return atom
    const compiled = compileFilter(atom, values, udtOf)
    if (compiled.error) return compiled
    sqls.push(compiled.sql)
  }
  return { sql: `(${sqls.join(' OR ')})` }
}

/**
 * @returns {{ sql: string } | { error: string }}
 */
export function compileWhereClause(filters, values, udtOf) {
  if (!filters?.length) return { sql: '' }
  const parts = []
  for (const filter of filters) {
    const compiled = compileFilter(filter, values, udtOf)
    if (compiled.error) return compiled
    parts.push(compiled.sql)
  }
  return { sql: ` WHERE ${parts.join(' AND ')}` }
}
