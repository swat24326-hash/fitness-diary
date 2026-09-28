import { pushPlaceholder } from './bind.js'
import { compileWhereClause } from './filters.js'
import { parseSelectList, quoteIdent, quoteTable } from './ident.js'

function noUdt() {
  return null
}

function orderSql(orders) {
  if (!orders?.length) return { sql: '' }
  const parts = []
  for (const order of orders) {
    const col = quoteIdent(order.column)
    if (!col) return { error: `Недопустимое имя поля: ${order.column}` }
    let piece = `${col} ${order.ascending === false ? 'DESC' : 'ASC'}`
    if (order.nullsFirst === true) piece += ' NULLS FIRST'
    else if (order.nullsFirst === false) piece += ' NULLS LAST'
    parts.push(piece)
  }
  return { sql: ` ORDER BY ${parts.join(', ')}` }
}

function limitSql(spec) {
  let sql = ''
  if (spec.limit != null) {
    const n = Math.trunc(Number(spec.limit))
    if (!Number.isFinite(n) || n < 0) return { error: 'Некорректный limit' }
    sql += ` LIMIT ${n}`
  }
  if (spec.offset != null) {
    const n = Math.trunc(Number(spec.offset))
    if (!Number.isFinite(n) || n < 0) return { error: 'Некорректный offset' }
    sql += ` OFFSET ${n}`
  }
  return { sql }
}

function normalizeRows(payload) {
  if (payload == null) return { error: 'Пустая запись' }
  const rows = Array.isArray(payload) ? payload : [payload]
  if (!rows.length) return { error: 'Пустая запись' }
  const keys = []
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: 'Запись ждёт объект' }
    for (const key of Object.keys(row)) {
      if (row[key] === undefined || seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }
  if (!keys.length) return { error: 'Нет полей для записи' }
  return { rows, keys }
}

function returningSql(spec) {
  if (!spec.returning) return { sql: '' }
  const cols = parseSelectList(spec.columns || '*')
  if (cols.error) return cols
  return { sql: ` RETURNING ${cols.sql}` }
}

function compileSelect(spec, table, udtOf) {
  const values = []
  const where = compileWhereClause(spec.filters, values, udtOf)
  if (where.error) return where
  if (spec.head) {
    return {
      text: null,
      countText: `SELECT count(*)::int AS _fd_count FROM ${table}${where.sql}`,
      values,
    }
  }
  const cols = parseSelectList(spec.columns || '*')
  if (cols.error) return cols
  const order = orderSql(spec.orders)
  if (order.error) return order
  const lim = limitSql(spec)
  if (lim.error) return lim
  return {
    text: `SELECT ${cols.sql} FROM ${table}${where.sql}${order.sql}${lim.sql}`,
    countText: spec.count === 'exact' ? `SELECT count(*)::int AS _fd_count FROM ${table}${where.sql}` : null,
    values,
  }
}

function compileInsert(spec, table, udtOf, conflict) {
  const built = normalizeRows(spec.payload)
  if (built.error) return built
  const colSql = []
  for (const key of built.keys) {
    const q = quoteIdent(key)
    if (!q) return { error: `Недопустимое имя поля: ${key}` }
    colSql.push(q)
  }
  const values = []
  const tuples = built.rows.map((row) => {
    const ph = built.keys.map((key) => {
      const present = Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined
      if (!present && spec.missingDefault) return 'DEFAULT'
      return pushPlaceholder(values, present ? row[key] : null, udtOf(key))
    })
    return `(${ph.join(', ')})`
  })
  let text = `INSERT INTO ${table} (${colSql.join(', ')}) VALUES ${tuples.join(', ')}`
  if (conflict) {
    const targets = String(conflict.onConflict ?? '')
      .split(',')
      .map((s) => quoteIdent(s.trim()))
    if (!conflict.onConflict || targets.some((t) => !t)) return { error: 'Нужен onConflict из имён полей' }
    if (conflict.ignoreDuplicates) {
      text += ` ON CONFLICT (${targets.join(', ')}) DO NOTHING`
    } else {
      const sets = colSql.map((col) => `${col} = EXCLUDED.${col}`)
      text += ` ON CONFLICT (${targets.join(', ')}) DO UPDATE SET ${sets.join(', ')}`
    }
  }
  const ret = returningSql(spec)
  if (ret.error) return ret
  text += ret.sql
  return { text, countText: null, values }
}

function compileUpdate(spec, table, udtOf) {
  if (!spec.filters?.length) return { error: 'update без фильтра запрещён' }
  if (!spec.payload || typeof spec.payload !== 'object' || Array.isArray(spec.payload)) {
    return { error: 'update ждёт объект' }
  }
  const keys = Object.keys(spec.payload).filter((key) => spec.payload[key] !== undefined)
  if (!keys.length) return { error: 'Нет полей для записи' }
  const values = []
  const sets = []
  for (const key of keys) {
    const q = quoteIdent(key)
    if (!q) return { error: `Недопустимое имя поля: ${key}` }
    sets.push(`${q} = ${pushPlaceholder(values, spec.payload[key], udtOf(key))}`)
  }
  const where = compileWhereClause(spec.filters, values, udtOf)
  if (where.error) return where
  const ret = returningSql(spec)
  if (ret.error) return ret
  return {
    text: `UPDATE ${table} SET ${sets.join(', ')}${where.sql}${ret.sql}`,
    countText: null,
    values,
  }
}

function compileDelete(spec, table, udtOf) {
  if (!spec.filters?.length) return { error: 'delete без фильтра запрещён' }
  const values = []
  const where = compileWhereClause(spec.filters, values, udtOf)
  if (where.error) return where
  const ret = returningSql(spec)
  if (ret.error) return ret
  return { text: `DELETE FROM ${table}${where.sql}${ret.sql}`, countText: null, values }
}

/**
 * Чистый построитель SQL. Без сети и без pg.
 * @param {object} spec
 * @param {{ udtOf?: (column: string) => string | null }} [opts]
 * @returns {{ text: string | null, countText: string | null, values: unknown[] } | { error: string }}
 */
export function compilePgRestQuery(spec, opts = {}) {
  const udtOf = opts.udtOf || noUdt
  const table = quoteTable(spec?.table)
  if (!table) return { error: `Недопустимое имя таблицы: ${spec?.table}` }
  if (spec.op === 'select') return compileSelect(spec, table, udtOf)
  if (spec.op === 'insert') return compileInsert(spec, table, udtOf, null)
  if (spec.op === 'upsert') {
    return compileInsert(spec, table, udtOf, {
      onConflict: spec.onConflict,
      ignoreDuplicates: spec.ignoreDuplicates,
    })
  }
  if (spec.op === 'update') return compileUpdate(spec, table, udtOf)
  if (spec.op === 'delete') return compileDelete(spec, table, udtOf)
  return { error: 'Пустой запрос' }
}
