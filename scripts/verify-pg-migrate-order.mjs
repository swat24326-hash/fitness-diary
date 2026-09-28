/**
 * Чистая проверка порядка миграций + маркеров auth.* + SSL (без живого Postgres).
 * node scripts/verify-pg-migrate-order.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildPgMigratePlan,
  filterPendingMigrateSteps,
  findSupabaseAuthSqlMarkers,
  pgClientSslOption,
  sortMigrationFilenames,
} from '../src/lib/pgMigrateOrderCore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SUPABASE_DIR = join(ROOT, 'supabase')

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

const sorted = sortMigrationFilenames([
  '20260809120000_club_trainer_pay_month_snapshots.sql',
  '20260210120000_users_club_id.sql',
  'readme.txt',
  '20260513120000_health_cards_goal.sql',
])
ok(sorted[0] === '20260210120000_users_club_id.sql', 'sort earliest first')
ok(sorted.length === 3, 'non-sql filtered')
ok(sorted[2].startsWith('20260809'), 'sort latest last')

const plan = buildPgMigratePlan({
  hasAuthStub: true,
  hasSchema: true,
  migrationFiles: ['20260210120000_users_club_id.sql', '20260513120000_health_cards_goal.sql'],
  hasPolicies: true,
})
ok(plan[0].id === 'c2_auth_stub.sql' && plan[0].kind === 'auth_stub', 'auth stub first')
ok(plan[1].id === 'schema.sql' && plan[1].kind === 'schema', 'schema second')
ok(plan[2].id === 'c2_auth_helpers.sql' && plan[2].kind === 'auth_helpers', 'auth helpers before migrations')
ok(plan[3].id === 'migrations/20260210120000_users_club_id.sql', 'migration path id')
ok(plan[plan.length - 2].id === 'policies.sql', 'policies после миграций (опирается на их fit_auth_*)')
ok(plan[plan.length - 1].id === 'c2_rest_grants.sql', 'rest grants last (после всех таблиц)')

const planNoPolicies = buildPgMigratePlan({
  hasAuthStub: true,
  hasSchema: true,
  migrationFiles: ['a.sql'],
  hasPolicies: false,
})
ok(!planNoPolicies.some((s) => s.kind === 'policies'), 'can omit policies')
ok(!planNoPolicies.some((s) => s.kind === 'rest_grants'), 'no rest grants without policies')

const grantsSql = await readFile(join(SUPABASE_DIR, 'c2_rest_grants.sql'), 'utf8')
ok(/relrowsecurity/.test(grantsSql), 'grants: запись только в таблицы с RLS')
ok(/GRANT SELECT ON public\.%I TO authenticated/.test(grantsSql), 'grants: без RLS — только чтение')
ok(/_schema_migrations/.test(grantsSql), 'grants: служебная таблица миграций закрыта')

const pending = filterPendingMigrateSteps(plan, ['c2_auth_stub.sql', 'schema.sql'])
ok(pending.length === plan.length - 2, 'skip applied stub+schema')
ok(pending[0].kind === 'auth_helpers', 'next is auth helpers')

const emptyPending = filterPendingMigrateSteps(
  plan,
  plan.map((s) => s.id),
)
ok(emptyPending.length === 0, 'all applied → empty')

ok(findSupabaseAuthSqlMarkers('REFERENCES auth.users (id)').includes('auth.users'), 'detect auth.users')
ok(findSupabaseAuthSqlMarkers('WHERE u.id = auth.uid()').includes('auth.uid()'), 'detect auth.uid')
ok(findSupabaseAuthSqlMarkers('TO authenticated').includes('to authenticated'), 'detect role grant')
ok(findSupabaseAuthSqlMarkers('SELECT 1').length === 0, 'plain SQL has no markers')

ok(pgClientSslOption('postgres://u:p@127.0.0.1:5432/db') === undefined, 'localhost no ssl force')
ok(pgClientSslOption('postgres://u:p@db.example:6432/db')?.rejectUnauthorized === false, 'remote ssl default')
ok(pgClientSslOption('postgres://u:p@db.example:6432/db?sslmode=disable') === undefined, 'sslmode=disable')
ok(pgClientSslOption('postgres://u:p@db.example:6432/db?sslmode=require')?.rejectUnauthorized === false, 'sslmode=require')

const stubSql = await readFile(join(SUPABASE_DIR, 'c2_auth_stub.sql'), 'utf8')
ok(stubSql.includes('CREATE SCHEMA IF NOT EXISTS auth'), 'stub creates auth schema')
ok(stubSql.includes('auth.users'), 'stub creates auth.users')
ok(stubSql.includes('auth.uid()'), 'stub creates auth.uid')
ok(stubSql.toLowerCase().includes('authenticated'), 'stub creates authenticated role')
ok(!/\bBYPASSRLS\b/i.test(stubSql.replace(/--.*$/gm, '')), 'stub avoids BYPASSRLS (superuser-only on Managed PG)')
ok(stubSql.includes('insufficient_privilege'), 'stub explains missing CREATE ROLE')

const fnNames = (sql) =>
  [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(fit_auth_\w+)\(/gi)].map((m) => m[1])
const helpersSql = await readFile(join(SUPABASE_DIR, 'c2_auth_helpers.sql'), 'utf8')
const policiesSql = await readFile(join(SUPABASE_DIR, 'policies.sql'), 'utf8')
const helperFns = new Set(fnNames(helpersSql))
const policyFns = fnNames(policiesSql)
ok(policyFns.length > 0, 'policies.sql defines fit_auth_* helpers')
ok(
  policyFns.every((f) => helperFns.has(f)),
  `c2_auth_helpers.sql covers policies.sql helpers (${policyFns.join(', ')})`,
)

const migrationNames = sortMigrationFilenames(await readdir(join(SUPABASE_DIR, 'migrations')))
ok(migrationNames.length > 0, 'real migrations present')

const earlyUsers = []
for (const name of migrationNames) {
  const sql = await readFile(join(SUPABASE_DIR, 'migrations', name), 'utf8')
  const defined = new Set(fnNames(sql))
  const used = [...sql.matchAll(/public\.(fit_auth_\w+)\(\)/g)].map((m) => m[1])
  for (const f of used) {
    if (!defined.has(f) && !helperFns.has(f)) earlyUsers.push(`${name}:${f}`)
  }
  for (const f of defined) helperFns.add(f)
}
ok(earlyUsers.length === 0, `fit_auth_* defined before use on bare PG${earlyUsers.length ? ` (${earlyUsers.join(', ')})` : ''}`)

const policiesUses = [...new Set([...policiesSql.matchAll(/public\.(fit_auth_\w+)\(\)/g)].map((m) => m[1]))]
const policiesMissing = policiesUses.filter((f) => !helperFns.has(f) && !policyFns.includes(f))
ok(
  policiesMissing.length === 0,
  `policies.sql после миграций находит все fit_auth_*${policiesMissing.length ? ` (нет: ${policiesMissing.join(', ')})` : ''}`,
)

let filesWithAuthMarkers = 0
for (const name of migrationNames) {
  const sql = await readFile(join(SUPABASE_DIR, 'migrations', name), 'utf8')
  if (findSupabaseAuthSqlMarkers(sql).length) filesWithAuthMarkers++
}
ok(filesWithAuthMarkers > 0, `real tree uses auth/RLS (${filesWithAuthMarkers} files) — stub required`)

const dryPlan = buildPgMigratePlan({
  hasAuthStub: true,
  hasSchema: true,
  migrationFiles: migrationNames,
  hasPolicies: false,
})
ok(dryPlan[0].kind === 'auth_stub', 'dry plan starts with stub')
ok(dryPlan.some((s) => s.kind === 'schema'), 'dry plan has schema')
ok(dryPlan.some((s) => s.kind === 'auth_helpers'), 'dry plan has auth helpers')
ok(!dryPlan.some((s) => s.kind === 'policies'), 'default C2 plan skips policies')

if (failed) process.exit(1)
console.log('verify-pg-migrate-order: all passed')
