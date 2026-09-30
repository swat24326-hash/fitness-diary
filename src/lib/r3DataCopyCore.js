/**
 * R3 (ночь переезда): план копирования данных Supabase → Managed PG, без сети и базы.
 * Исполнитель — scripts/r3-copy-data.mjs.
 */

export const R3_SKIP_TABLES = ['_schema_migrations']

/**
 * Уникальные индексы из миграций, которых на prod Supabase нет (там уже есть дубли).
 * Перенос снимает их на время вставки и пробует вернуть; не вернулся — отчёт, а не отказ переезда.
 */
export const R3_RELAXED_UNIQUE_INDEXES = ['idx_clients_club_card_number_unique']

/**
 * Порядок вставки: родитель раньше ребёнка. Ссылки вне списка (auth.users) и на себя не держат порядок.
 * @param {string[]} tables
 * @param {Array<{ from: string, to: string }>} fks
 */
export function orderTablesByFk(tables, fks) {
  const set = new Set(tables)
  const deps = new Map(tables.map((t) => [t, new Set()]))
  for (const { from, to } of fks) {
    if (set.has(from) && set.has(to) && from !== to) deps.get(from).add(to)
  }
  const out = []
  const state = new Map()
  const visit = (t, path) => {
    if (state.get(t) === 'done') return
    if (state.get(t) === 'walk') throw new Error(`Цикл внешних ключей: ${[...path, t].join(' → ')}`)
    state.set(t, 'walk')
    for (const d of [...deps.get(t)].sort()) visit(d, [...path, t])
    state.set(t, 'done')
    out.push(t)
  }
  for (const t of [...tables].sort()) visit(t, [])
  return out
}

/**
 * @param {{
 *   source: Record<string, string[]>,
 *   target: Record<string, { columns: string[], generated?: string[], pk?: string[] }>,
 *   fks: Array<{ from: string, to: string }>,
 * }} input
 */
export function planR3Copy({ source, target, fks }) {
  const skip = new Set(R3_SKIP_TABLES)
  const targetTables = Object.keys(target).filter((t) => !skip.has(t))
  const missingOnTarget = Object.keys(source).filter((t) => !skip.has(t) && !target[t]).sort()
  const missingOnSource = targetTables.filter((t) => !source[t]).sort()
  const copy = []
  const sourceOnlyColumns = {}
  const targetOnlyColumns = {}
  for (const t of orderTablesByFk(targetTables, fks)) {
    if (!source[t]) continue
    const gen = new Set(target[t].generated ?? [])
    const src = new Set(source[t])
    const columns = target[t].columns.filter((c) => !gen.has(c) && src.has(c))
    const extraSrc = source[t].filter((c) => !target[t].columns.includes(c))
    const extraTgt = target[t].columns.filter((c) => !gen.has(c) && !src.has(c))
    if (extraSrc.length) sourceOnlyColumns[t] = extraSrc
    if (extraTgt.length) targetOnlyColumns[t] = extraTgt
    const pk = (target[t].pk ?? []).filter((c) => columns.includes(c))
    copy.push({ table: t, columns, order: pk.length ? pk : columns.slice(0, 1) })
  }
  return { copy, missingOnTarget, missingOnSource, sourceOnlyColumns, targetOnlyColumns }
}

/**
 * Пачки для одной вставки: не больше maxRows строк и примерно maxBytes JSON.
 * @param {object[]} rows
 */
export function chunkRows(rows, { maxRows = 500, maxBytes = 2_000_000 } = {}) {
  const out = []
  let cur = []
  let size = 0
  for (const r of rows) {
    const s = JSON.stringify(r).length
    if (cur.length && (cur.length >= maxRows || size + s > maxBytes)) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(r)
    size += s
  }
  if (cur.length) out.push(cur)
  return out
}

/** Content-Range PostgREST «0-0/123» или «* /0» → 123. */
export function parseContentRangeTotal(header) {
  const m = /\/(\d+)\s*$/.exec(String(header ?? ''))
  return m ? Number(m[1]) : null
}

/** Сверка после копирования: таблицы, где в цели не столько строк, сколько в источнике. */
export function countMismatches(sourceCounts, targetCounts) {
  return Object.keys(sourceCounts)
    .filter((t) => Number(targetCounts[t] ?? -1) !== Number(sourceCounts[t]))
    .map((t) => ({ table: t, source: sourceCounts[t], target: targetCounts[t] ?? null }))
}

/** Адрес цели не должен быть облаком Supabase: копируем только в свой Postgres. */
export function r3TargetGuardError(databaseUrl) {
  const raw = String(databaseUrl ?? '').trim()
  if (!raw) return 'Задайте DATABASE_URL (Managed PG).'
  if (/supabase\.(co|com|net)/i.test(raw)) return 'DATABASE_URL указывает на Supabase — цель должна быть свой Postgres.'
  return null
}
