/**
 * Миграция шаблонов ДЗ (homework_presets).
 *
 *   npm run db:migrate:homework -- --linked
 * или SUPABASE_DB_PASSWORD (+ VITE_SUPABASE_URL / SUPABASE_PROJECT_REF)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260716120000_homework_presets.sql'
const VERIFY_SQL =
  "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'homework_presets') as homework_presets_table;"

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
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || readDotEnv('SUPABASE_DB_PASSWORD')
  if (!password) {
    fail('Задайте SUPABASE_DB_PASSWORD или: npm run db:migrate:homework -- --linked')
  }
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref: VITE_SUPABASE_URL или SUPABASE_PROJECT_REF')
  const dbUrl = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
  dbArgs = ['--db-url', dbUrl]
}

run(`apply ${MIGRATION}`, ['db', 'query', ...dbArgs, '--file', MIGRATION, '--yes'])
run('verify homework_presets', ['db', 'query', ...dbArgs, VERIFY_SQL, '--yes'])
console.log('\nHomework presets migration applied.')
