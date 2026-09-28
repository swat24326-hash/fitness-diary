import { compilePgRestQuery } from './buildSql.js'
import { executeCompiled, loadUdtOf } from './pool.js'
import { shapePgRestResult } from './shapeResult.js'

function blankSpec(table) {
  return {
    table,
    op: null,
    columns: '*',
    count: null,
    head: false,
    filters: [],
    orders: [],
    limit: null,
    offset: null,
    payload: null,
    onConflict: null,
    ignoreDuplicates: false,
    returning: false,
    single: null,
  }
}

export class PgRestQuery {
  /**
   * @param {string} table
   */
  constructor(table) {
    this.spec = blankSpec(table)
    /** @type {AbortSignal | null} */
    this.signal = null
  }

  select(columns, options) {
    const cols = columns == null || columns === '' ? '*' : String(columns)
    if (!this.spec.op || this.spec.op === 'select') {
      this.spec.op = 'select'
      this.spec.columns = cols
    } else {
      this.spec.returning = true
      this.spec.columns = cols
    }
    if (options?.count) this.spec.count = options.count
    if (options?.head) this.spec.head = true
    return this
  }

  insert(payload) {
    this.spec.op = 'insert'
    this.spec.payload = payload
    return this
  }

  upsert(payload, options) {
    this.spec.op = 'upsert'
    this.spec.payload = payload
    this.spec.onConflict = options?.onConflict ?? null
    this.spec.ignoreDuplicates = options?.ignoreDuplicates === true
    return this
  }

  update(payload) {
    this.spec.op = 'update'
    this.spec.payload = payload
    return this
  }

  delete() {
    this.spec.op = 'delete'
    return this
  }

  eq(column, value) {
    this.spec.filters.push({ op: 'eq', column, value })
    return this
  }

  neq(column, value) {
    this.spec.filters.push({ op: 'neq', column, value })
    return this
  }

  gt(column, value) {
    this.spec.filters.push({ op: 'gt', column, value })
    return this
  }

  gte(column, value) {
    this.spec.filters.push({ op: 'gte', column, value })
    return this
  }

  lt(column, value) {
    this.spec.filters.push({ op: 'lt', column, value })
    return this
  }

  lte(column, value) {
    this.spec.filters.push({ op: 'lte', column, value })
    return this
  }

  like(column, value) {
    this.spec.filters.push({ op: 'like', column, value })
    return this
  }

  ilike(column, value) {
    this.spec.filters.push({ op: 'ilike', column, value })
    return this
  }

  is(column, value) {
    this.spec.filters.push({ op: 'is', column, value })
    return this
  }

  in(column, values) {
    this.spec.filters.push({ op: 'in', column, value: Array.isArray(values) ? values : [] })
    return this
  }

  or(expr) {
    this.spec.filters.push({ op: 'or', expr: String(expr ?? '') })
    return this
  }

  not(column, operator, value) {
    this.spec.filters.push({ op: operator, column, value, negate: true })
    return this
  }

  order(column, options) {
    this.spec.orders.push({
      column,
      ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst,
    })
    return this
  }

  limit(n) {
    const v = Number(n)
    this.spec.limit = Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0
    return this
  }

  range(from, to) {
    const startRaw = Number(from)
    const endRaw = Number(to)
    const start = Number.isFinite(startRaw) ? Math.max(0, Math.trunc(startRaw)) : 0
    const end = Number.isFinite(endRaw) ? Math.max(start, Math.trunc(endRaw)) : start
    this.spec.offset = start
    this.spec.limit = end - start + 1
    return this
  }

  single() {
    this.spec.single = 'single'
    return this
  }

  maybeSingle() {
    this.spec.single = 'maybeSingle'
    return this
  }

  abortSignal(signal) {
    this.signal = signal ?? null
    return this
  }

  async execute() {
    if (this.signal?.aborted) {
      return { data: null, error: { message: 'Запрос отменён', code: 'ABORT', details: null, hint: null }, count: null }
    }
    try {
      const udtOf = await loadUdtOf(this.spec.table)
      const compiled = compilePgRestQuery(this.spec, { udtOf })
      if (compiled.error) {
        return { data: null, error: { message: compiled.error, code: 'PGREST', details: null, hint: null }, count: null }
      }
      const out = await executeCompiled(compiled)
      if (this.signal?.aborted) {
        return { data: null, error: { message: 'Запрос отменён', code: 'ABORT', details: null, hint: null }, count: null }
      }
      return shapePgRestResult(out.rows, this.spec, out.count)
    } catch (e) {
      return {
        data: null,
        error: {
          message: e?.message || 'Ошибка запроса к базе',
          code: e?.code ?? null,
          details: e?.detail ?? null,
          hint: e?.hint ?? null,
        },
        count: null,
      }
    }
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected)
  }
}

export function createPgRestClient() {
  return {
    from(table) {
      return new PgRestQuery(table)
    },
  }
}
