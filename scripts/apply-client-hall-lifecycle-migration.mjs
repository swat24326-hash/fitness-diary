/**
 * Миграция client_hall_lifecycle (закрытие направлений ПЗ/ТЗ/АЗ).
 *
 *   npm run db:migrate:client-hall-lifecycle -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260821120000_client_hall_lifecycle.sql'
const VERIFY_FILE = 'scripts/.tmp-verify-client-hall-lifecycle.sql'
const VERIFY_SQL =
  "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'client_hall_lifecycle';\n"

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
let dbArgs
if (useLinked) {
  dbArgs = ['--linked']
} else {
  const password =
    process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || readDotEnv('SUPABASE_DB_PASSWORD')
  if (!password) {
    fail('Задайте SUPABASE_DB_PASSWORD или: npm run db:migrate:client-hall-lifecycle -- --linked')
  }
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    readDotEnv('SUPABASE_PROJECT_REF') ||
    projectRefFromUrl(process.env.SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден SUPABASE_PROJECT_REF / VITE_SUPABASE_URL')
  dbArgs = ['--db-url', `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`]
}

run('apply client_hall_lifecycle', ['db', 'query', ...dbArgs, '--file', MIGRATION])

writeFileSync(resolve(VERIFY_FILE), VERIFY_SQL, 'utf8')
try {
  run('verify client_hall_lifecycle table', ['db', 'query', ...dbArgs, '--file', VERIFY_FILE])
} finally {
  try {
    unlinkSync(resolve(VERIFY_FILE))
  } catch {
    /* ignore */
  }
}

console.log('\n✓ client_hall_lifecycle migration complete')
