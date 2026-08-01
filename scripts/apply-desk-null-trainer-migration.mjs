/**
 * Миграция: clients.trainer_id nullable для desk ТЗ/АЗ.
 *   npm run db:migrate:desk-null-trainer -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260802120000_clients_trainer_id_nullable_desk.sql'

const VERIFY_SQL =
  "select c.is_nullable as trainer_id_nullable, (select count(*)::int from pg_constraint where conname = 'clients_trainer_or_desk_hall_chk') as has_check from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'clients' and c.column_name = 'trainer_id';"

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

if (!existsSync(resolve(MIGRATION))) fail(`Нет файла ${MIGRATION}`)

const useLinked = process.argv.includes('--linked')

if (useLinked) {
  run(`apply ${MIGRATION}`, ['db', 'query', '--linked', '--file', MIGRATION, '--yes'])
  run('verify nullable + check', ['db', 'query', '--linked', VERIFY_SQL, '--yes'])
} else {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || ''
  if (!password) {
    fail('Нужен пароль Postgres или --linked.\n  npm run db:migrate:desk-null-trainer -- --linked')
  }
  const ref = projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref в VITE_SUPABASE_URL (.env)')
  const dbUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
  run(`apply ${MIGRATION}`, ['db', 'query', '--db-url', dbUrl, '--file', MIGRATION, '--yes'])
  run('verify nullable + check', ['db', 'query', '--db-url', dbUrl, VERIFY_SQL, '--yes'])
}

console.log('\nМиграция desk null trainer применена.')
