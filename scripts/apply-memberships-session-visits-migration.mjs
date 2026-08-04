/**
 * npm run db:migrate:memberships-session-visits -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260804223000_memberships_session_visits.sql'
const VERIFY_SQL =
  "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='memberships' and column_name='session_visits';"

function fail(msg) {
  console.error(msg)
  process.exit(1)
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

if (!process.argv.includes('--linked')) {
  console.log(`Файл: ${MIGRATION}`)
  console.log('Применить на linked: npm run db:migrate:memberships-session-visits -- --linked')
  process.exit(0)
}

run(`apply ${MIGRATION}`, ['db', 'query', '--linked', '--file', MIGRATION, '--yes'])
run('verify session_visits', ['db', 'query', '--linked', VERIFY_SQL, '--yes'])
