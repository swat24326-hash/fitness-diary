import { parseOrAtom, splitTopLevel } from './filters.js'

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or'])

/** Колонки, которые браузер не видит, не фильтрует и не пишет: при своём Auth тут настоящие хеши. */
const HIDDEN_COLUMNS = { users: ['password_hash'] }

function badRequest(message) {
  return { error: { status: 400, code: 'PGRST100', message } }
}

function hiddenColumnsOf(table) {
  return HIDDEN_COLUMNS[table] ?? []
}

function touchesHiddenColumn(table, params, body) {
  const hidden = hiddenColumnsOf(table)
  if (!hidden.length) return false
  const query = decodeURIComponent(params.toString()).toLowerCase()
  if (hidden.some((col) => query.includes(col))) return true
  const rows = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : []
  return rows.some((row) => row && hidden.some((col) => Object.keys(row).some((k) => k.toLowerCase() === col)))
}

/**
 * Убрать скрытые колонки из ответа (select=* на users).
 * @param {string} table
 * @param {object[]} rows
 */
export function stripHiddenColumns(table, rows) {
  const hidden = hiddenColumnsOf(table)
  if (!hidden.length) return rows
  return rows.map((row) => {
    const copy = { ...row }
    for (const col of hidden) delete copy[col]
    return copy
  })
}

/**
 * Аноним по правилам supabase-js: без сессии он шлёт Bearer = apikey (или не шлёт вовсе).
 * Просроченный токен пользователя сюда не попадает — ему нужен 401, чтобы клиент обновил сессию.
 * @param {Record<string, string | string[] | undefined>} headers
 */
export function isAnonRestV1Request(headers) {
  const auth = String(headers?.authorization ?? '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return true
  const apikey = String(headers?.apikey ?? '').trim()
  return Boolean(apikey) && token === apikey
}

/** Заголовок Prefer может прийти несколькими значениями — Node склеивает их через запятую. */
export function parsePreferHeader(raw) {
  const out = {}
  for (const token of String(raw ?? '').split(',')) {
    const [key, value] = token.split('=').map((s) => s.trim())
    if (key && value) out[key] = value
  }
  return out
}

function parseOrder(raw) {
  const orders = []
  for (const part of splitTopLevel(raw)) {
    const [column, ...mods] = part.split('.')
    const order = { column, ascending: true, nullsFirst: undefined }
    for (const mod of mods) {
      if (mod === 'asc') order.ascending = true
      else if (mod === 'desc') order.ascending = false
      else if (mod === 'nullsfirst') order.nullsFirst = true
      else if (mod === 'nullslast') order.nullsFirst = false
      else return { error: `Не разобран order: ${part}` }
    }
    orders.push(order)
  }
  return { orders }
}

function parseNonNegInt(raw, name) {
  if (raw == null) return { value: null }
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) return { error: `Некорректный ${name}` }
  return { value: n }
}

function parseFilter(key, value) {
  if (key === 'or') {
    const s = String(value ?? '').trim()
    if (!s.startsWith('(') || !s.endsWith(')')) return { error: 'or ждёт (…)' }
    return { filter: { op: 'or', expr: s.slice(1, -1) } }
  }
  const atom = parseOrAtom(`${key}.${value}`)
  if (atom.error) return atom
  if ((atom.op === 'like' || atom.op === 'ilike') && typeof atom.value === 'string') {
    atom.value = atom.value.replace(/\*/g, '%')
  }
  return { filter: atom }
}

function opForMethod(method, prefer) {
  if (method === 'GET' || method === 'HEAD') return 'select'
  if (method === 'POST') return prefer.resolution ? 'upsert' : 'insert'
  if (method === 'PATCH') return 'update'
  if (method === 'DELETE') return 'delete'
  return null
}

/**
 * Запрос браузера (supabase-js → /rest/v1/<table>) → spec для compilePgRestQuery.
 * @param {{ method: string, table: string, params: URLSearchParams, headers: Record<string, string | string[] | undefined>, body?: unknown }} req
 */
export function parseRestV1Request(req) {
  const method = String(req?.method ?? 'GET').toUpperCase()
  const headers = req?.headers ?? {}
  const prefer = parsePreferHeader(headers.prefer)
  const op = opForMethod(method, prefer)
  if (!op) return { error: { status: 405, code: 'PGRST117', message: `Метод ${method} не поддержан` } }
  for (const h of ['accept-profile', 'content-profile']) {
    if (headers[h] && headers[h] !== 'public') return badRequest('Доступна только схема public')
  }

  const params = req.params ?? new URLSearchParams()
  if (touchesHiddenColumn(String(req?.table ?? ''), params, req?.body)) {
    return { error: { status: 403, code: '42501', message: 'Поле недоступно' } }
  }
  const filters = []
  for (const [key, value] of params.entries()) {
    if (RESERVED.has(key) && key !== 'or') continue
    const parsed = parseFilter(key, value)
    if (parsed.error) return badRequest(parsed.error)
    filters.push(parsed.filter)
  }

  const order = parseOrder(params.get('order') ?? '')
  if (order.error) return badRequest(order.error)
  const limit = parseNonNegInt(params.get('limit'), 'limit')
  if (limit.error) return badRequest(limit.error)
  const offset = parseNonNegInt(params.get('offset'), 'offset')
  if (offset.error) return badRequest(offset.error)

  const isWrite = op !== 'select'
  const spec = {
    table: String(req?.table ?? ''),
    op,
    columns: params.get('select') || '*',
    count: !isWrite && prefer.count === 'exact' ? 'exact' : null,
    head: method === 'HEAD',
    filters,
    orders: isWrite ? [] : order.orders,
    limit: isWrite ? null : limit.value,
    offset: isWrite ? null : offset.value,
    payload: isWrite && op !== 'delete' ? req.body : null,
    onConflict: op === 'upsert' ? params.get('on_conflict') : null,
    ignoreDuplicates: prefer.resolution === 'ignore-duplicates',
    missingDefault: prefer.missing === 'default',
    returning: isWrite && prefer.return === 'representation',
  }
  if (spec.head && prefer.count !== 'exact') spec.count = 'exact'
  if (op === 'upsert' && !spec.onConflict) return badRequest('upsert ждёт on_conflict')

  const accept = String(headers.accept ?? '')
  return {
    spec,
    method,
    single: accept.includes('application/vnd.pgrst.object+json'),
  }
}
