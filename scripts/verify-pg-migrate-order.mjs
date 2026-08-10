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
ok(plan[2].id === 'migrations/20260210120000_users_club_id.sql', 'migration path id')
ok(plan[plan.length - 1].id === 'policies.sql', 'policies last')

const planNoPolicies = buildPgMigratePlan({
  hasAuthStub: true,
  hasSchema: true,
  migrationFiles: ['a.sql'],
  hasPolicies: false,
})
ok(!planNoPolicies.some((s) => s.kind === 'policies'), 'can omit policies')

const pending = filterPendingMigrateSteps(plan, ['c2_auth_stub.sql', 'schema.sql'])
ok(pending.length === plan.length - 2, 'skip applied stub+schema')
ok(pending[0].kind === 'migration', 'next is migration')

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

const migrationNames = sortMigrationFilenames(await readdir(join(SUPABASE_DIR, 'migrations')))
ok(migrationNames.length > 0, 'real migrations present')

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
ok(!dryPlan.some((s) => s.kind === 'policies'), 'default C2 plan skips policies')

if (failed) process.exit(1)
console.log('verify-pg-migrate-order: all passed')
