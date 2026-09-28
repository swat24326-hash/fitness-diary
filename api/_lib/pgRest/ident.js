const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** @returns {string | null} */
export function quoteIdent(name) {
  const s = String(name ?? '').trim()
  if (!IDENT.test(s)) return null
  return `"${s}"`
}

/** @returns {string | null} */
export function quoteTable(name) {
  const q = quoteIdent(name)
  if (!q) return null
  return `"public".${q}`
}

/**
 * Список колонок supabase `.select('a, b')`. Вложенные связи не поддерживаем.
 * @returns {{ sql: string } | { error: string }}
 */
export function parseSelectList(select) {
  const raw = String(select ?? '*').trim()
  if (!raw || raw === '*') return { sql: '*' }
  if (raw.includes('(')) return { error: 'Вложенный select (…) в data-port пока не поддержан' }
  const cols = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!cols.length) return { sql: '*' }
  const quoted = []
  for (const col of cols) {
    const q = quoteIdent(col)
    if (!q) return { error: `Недопустимое имя поля: ${col}` }
    quoted.push(q)
  }
  return { sql: quoted.join(', ') }
}
