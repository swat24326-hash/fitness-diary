/**
 * Миграции desk ТЗ/АЗ: paid_amount на memberships + desk_hall на clients.
 *   npm run db:migrate:desk-hall -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATIONS = [
  'supabase/migrations/20260801220000_memberships_paid_amount.sql',
  'supabase/migrations/20260801230000_clients_desk_hall.sql',
]

const VERIFY_SQL =
  "select table_name, column_name, data_type from information_schema.columns where table_schema='public' and ((table_name='memberships' and column_name='paid_amount') or (table_name='clients' and column_name='desk_hall')) order by table_name;"

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function readDotEnv(key) {
  const p = resolve('.env')
  if (!existsSync(p)) return ''
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    if (m[1].trim() === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

function projectRefFromUrl(url) {
  const m = String(url ?? '').match(/https:\/\/([^.]+)\.supabase\.co/)
  return m ? m[1] : ''
}

function run(label, args) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync('npx', ['supabase', ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  if (r.status !== 0) fail(`✗ ${label}`)
  console.log(`✓ ${label}`)
}

const useLinked = process.argv.includes('--linked')

for (const rel of MIGRATIONS) {
  if (!existsSync(resolve(rel))) fail(`Нет файла ${rel}`)
}

if (useLinked) {
  for (const rel of MIGRATIONS) {
    run(`apply ${rel}`, ['db', 'query', '--linked', '--file', rel, '--yes'])
  }
  run('verify columns (linked)', ['db', 'query', '--linked', VERIFY_SQL, '--yes'])
} else {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || ''
  if (!password) {
    fail('Нужен пароль Postgres или --linked.\n  npm run db:migrate:desk-hall -- --linked')
  }
  const ref = projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref в VITE_SUPABASE_URL (.env)')
  const dbUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
  for (const rel of MIGRATIONS) {
    run(`apply ${rel}`, ['db', 'query', '--db-url', dbUrl, '--file', rel, '--yes'])
  }
  run('verify columns', ['db', 'query', '--db-url', dbUrl, VERIFY_SQL, '--yes'])
}

console.log('\nМиграции desk (paid_amount + desk_hall) применены.')
