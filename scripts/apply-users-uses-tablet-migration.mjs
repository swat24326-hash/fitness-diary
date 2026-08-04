/**
 * Миграция: users.uses_tablet.
 *   npm run db:migrate:users-uses-tablet -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260802160000_users_uses_tablet.sql'

const VERIFY_SQL =
  "select count(*)::int as has_col from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'uses_tablet';"

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
  if (r.status !== 0) fail(`FAIL: ${label}`)
}

const linked = process.argv.includes('--linked')
if (!linked) {
  fail('Укажите --linked (прод/remote). Пример: npm run db:migrate:users-uses-tablet -- --linked')
}

const ref =
  process.env.SUPABASE_PROJECT_REF ||
  projectRefFromUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
if (!ref) fail('Нет project ref (SUPABASE_PROJECT_REF / VITE_SUPABASE_URL)')

if (!existsSync(resolve(MIGRATION))) fail(`Нет файла ${MIGRATION}`)

run('db query migration', ['db', 'query', '--linked', '-f', MIGRATION])
run('verify column', ['db', 'query', '--linked', VERIFY_SQL])
console.log('\n✓ users.uses_tablet applied')
