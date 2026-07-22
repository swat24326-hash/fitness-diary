/**
 * Применить индексы масштабирования на remote Supabase.
 *
 * Вариант A: Supabase CLI + пароль БД
 *   $env:SUPABASE_DB_PASSWORD="пароль из Dashboard → Settings → Database"
 *   npm run db:migrate:scalability
 *
 * Вариант B: уже выполнены supabase login && supabase link
 *   npm run db:migrate:scalability -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260710120100_scalability_indexes.sql'
const VERIFY_SQL =
  "select indexname from pg_indexes where schemaname='public' and indexname like 'idx_trainings_%' order by 1 limit 5;"

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
const migrationPath = resolve(MIGRATION)
if (!existsSync(migrationPath)) fail(`Нет файла ${MIGRATION}`)

if (useLinked) {
  run('apply scalability indexes (linked)', ['db', 'query', '--linked', '--file', MIGRATION, '--yes'])
  run('verify indexes (linked)', ['db', 'query', '--linked', VERIFY_SQL, '--yes'])
} else {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || ''
  if (!password) {
    fail(
      'Задайте SUPABASE_DB_PASSWORD (Dashboard → Settings → Database) или запустите с --linked после supabase link',
    )
  }
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref: VITE_SUPABASE_URL или SUPABASE_PROJECT_REF')
  const dbUrl = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
  run('apply scalability indexes', ['db', 'query', '--db-url', dbUrl, '--file', MIGRATION, '--yes'])
  run('verify indexes', ['db', 'query', '--db-url', dbUrl, VERIFY_SQL, '--yes'])
}

console.log('\nScalability indexes migration applied.')
