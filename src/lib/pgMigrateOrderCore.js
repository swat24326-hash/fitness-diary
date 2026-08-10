/**
 * Порядок применения SQL для bare Postgres (C2 / Yandex Managed PG).
 * Без React/IDB — для verify и runner.
 */

/** Маркеры SQL, которые на bare PG требуют c2_auth_stub.sql (не настоящий Supabase Auth). */
export const PG_SUPABASE_AUTH_SQL_MARKERS = [
  'auth.users',
  'auth.uid()',
  'auth.jwt()',
  'to authenticated',
  'to anon',
  'to service_role',
  'create policy',
  'enable row level security',
]

/**
 * @param {string[]} filenames — имена файлов в migrations/
 * @returns {string[]}
 */
export function sortMigrationFilenames(filenames) {
  return [...(filenames ?? [])]
    .map((f) => String(f ?? '').trim())
    .filter((f) => f.endsWith('.sql') && !f.includes('/') && !f.includes('\\'))
    .sort((a, b) => a.localeCompare(b, 'en'))
}

/**
 * @param {{
 *   hasSchema?: boolean,
 *   migrationFiles?: string[],
 *   hasPolicies?: boolean,
 *   hasAuthStub?: boolean,
 * }} opts
 * @returns {{ id: string, kind: 'auth_stub'|'schema'|'migration'|'policies', file: string }[]}
 */
export function buildPgMigratePlan(opts = {}) {
  /** @type {{ id: string, kind: 'auth_stub'|'schema'|'migration'|'policies', file: string }[]} */
  const steps = []
  if (opts.hasAuthStub !== false) {
    steps.push({ id: 'c2_auth_stub.sql', kind: 'auth_stub', file: 'c2_auth_stub.sql' })
  }
  if (opts.hasSchema !== false) {
    steps.push({ id: 'schema.sql', kind: 'schema', file: 'schema.sql' })
  }
  for (const name of sortMigrationFilenames(opts.migrationFiles ?? [])) {
    steps.push({ id: `migrations/${name}`, kind: 'migration', file: `migrations/${name}` })
  }
  if (opts.hasPolicies !== false) {
    steps.push({ id: 'policies.sql', kind: 'policies', file: 'policies.sql' })
  }
  return steps
}

/**
 * Какие шаги ещё не в таблице _schema_migrations.
 * @param {{ id: string }[]} plan
 * @param {Iterable<string>} appliedIds
 */
export function filterPendingMigrateSteps(plan, appliedIds) {
  const done = new Set([...(appliedIds ?? [])].map(String))
  return (plan ?? []).filter((s) => s?.id && !done.has(String(s.id)))
}

/**
 * Найти маркеры Supabase Auth / RLS в тексте SQL (нижний регистр).
 * @param {string} sql
 * @returns {string[]}
 */
export function findSupabaseAuthSqlMarkers(sql) {
  const lower = String(sql ?? '').toLowerCase()
  return PG_SUPABASE_AUTH_SQL_MARKERS.filter((m) => lower.includes(m))
}

/**
 * SSL для Managed PG (Yandex и др.): по умолчанию require, если URL не localhost
 * и не задан явно sslmode=disable.
 * @param {string} databaseUrl
 * @returns {boolean | object | undefined} значение для pg.Client `{ ssl }`
 */
export function pgClientSslOption(databaseUrl) {
  const raw = String(databaseUrl ?? '').trim()
  if (!raw) return undefined
  let u
  try {
    u = new URL(raw)
  } catch {
    return { rejectUnauthorized: false }
  }
  const mode = (u.searchParams.get('sslmode') || '').toLowerCase()
  if (mode === 'disable') return undefined
  if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') {
    return { rejectUnauthorized: mode === 'verify-full' || mode === 'verify-ca' }
  }
  const host = (u.hostname || '').toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined
  // Managed PG обычно требует SSL; self-signed CA — rejectUnauthorized: false на стенде.
  return { rejectUnauthorized: false }
}
