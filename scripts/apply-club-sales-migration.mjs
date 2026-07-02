/**
 * Применить миграцию club_sales на remote Supabase.
 *
 * Вариант A (рекомендуется): Supabase CLI + пароль БД
 *   $env:SUPABASE_DB_PASSWORD="пароль из Dashboard → Settings → Database"
 *   npm run db:migrate:sales
 *
 * Вариант B: уже выполнены supabase login && supabase link
 *   npm run db:migrate:sales -- --linked
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20260624120000_club_sales.sql'
const VERIFY_SQL =
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('club_sales_daily','club_sales_plan','club_supervisor_expense') order by 1;"

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
  run('apply migration (linked)', ['db', 'query', '--linked', '--file', MIGRATION, '--yes'])
  run('verify tables (linked)', ['db', 'query', '--linked', VERIFY_SQL, '--yes'])
} else {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || ''
  if (!password) {
    fail(
      [
        'Нужен пароль Postgres (Supabase → Project Settings → Database → Database password).',
        'PowerShell:',
        '  $env:SUPABASE_DB_PASSWORD="ваш_пароль"',
        '  npm run db:migrate:sales',
        '',
        'Или: supabase login && supabase link --project-ref <ref>',
        '  npm run db:migrate:sales -- --linked',
      ].join('\n'),
    )
  }
  const ref = projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref в VITE_SUPABASE_URL (.env)')
  const dbUrl = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
  run('apply migration', ['db', 'query', '--db-url', dbUrl, '--file', MIGRATION, '--yes'])
  run('verify tables', ['db', 'query', '--db-url', dbUrl, VERIFY_SQL, '--yes'])
}

console.log('\nМиграция club_sales применена.')
