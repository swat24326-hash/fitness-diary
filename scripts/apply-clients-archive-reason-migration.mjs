/**
 * Миграция причины архива: clients.archive_reason / archive_reason_at.
 *
 *   npm run db:migrate:clients-archive-reason -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260816120000_clients_archive_reason.sql'
const VERIFY_FILE = 'scripts/.tmp-verify-clients-archive-reason.sql'
const VERIFY_SQL =
  "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name in ('archive_reason', 'archive_reason_at') order by 1;\n"

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
    fail('Задайте SUPABASE_DB_PASSWORD или: npm run db:migrate:clients-archive-reason -- --linked')
  }
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    readDotEnv('SUPABASE_PROJECT_REF') ||
    projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Нужен SUPABASE_PROJECT_REF или VITE_SUPABASE_URL')
  dbArgs = ['--project-ref', ref, '--password', password]
}

run('migrate archive_reason', ['db', 'query', ...dbArgs, '--file', MIGRATION])

try {
  writeFileSync(resolve(VERIFY_FILE), VERIFY_SQL, 'utf8')
  run('verify columns', ['db', 'query', ...dbArgs, '--file', VERIFY_FILE])
} finally {
  try {
    unlinkSync(resolve(VERIFY_FILE))
  } catch {
    /* ignore */
  }
}

console.log('\nГотово: clients.archive_reason / archive_reason_at')
