/**
 * Применить миграцию plan_matrix на remote Supabase.
 *
 * Вариант A: Supabase CLI + пароль БД
 *   $env:SUPABASE_DB_PASSWORD="пароль из Dashboard → Settings → Database"
 *   npm run db:migrate:plan-matrix
 *
 * Вариант B: supabase login && supabase link
 *   npm run db:migrate:plan-matrix -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260714140000_club_sales_plan_matrix.sql'
const VERIFY_SQL =
  "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='club_sales_plan' and column_name='plan_matrix';"

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
  run('apply plan_matrix migration (linked)', ['db', 'query', '--linked', '--file', MIGRATION, '--yes'])
  run('verify plan_matrix column (linked)', ['db', 'query', '--linked', VERIFY_SQL, '--yes'])
} else {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || ''
  if (!password) {
    fail(
      [
        'Нужен пароль Postgres (Supabase → Project Settings → Database → Database password).',
        'PowerShell:',
        '  $env:SUPABASE_DB_PASSWORD="ваш_пароль"',
        '  npm run db:migrate:plan-matrix',
        '',
        'Или: supabase login && supabase link --project-ref <ref>',
        '  npm run db:migrate:plan-matrix -- --linked',
      ].join('\n'),
    )
  }
  const ref = projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref в VITE_SUPABASE_URL (.env)')
  const dbUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
  run('apply plan_matrix migration', ['db', 'query', '--db-url', dbUrl, '--file', MIGRATION, '--yes'])
  run('verify plan_matrix column', ['db', 'query', '--db-url', dbUrl, VERIFY_SQL, '--yes'])
}

console.log('\nМиграция plan_matrix применена.')
