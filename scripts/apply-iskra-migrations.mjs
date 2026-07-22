/**
 * Миграции ИСКРЫ: learning signals + spark_brief_enabled.
 *
 *   npm run db:migrate:iskra -- --linked
 * или с SUPABASE_DB_PASSWORD (см. apply-scalability-indexes.mjs)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATIONS = [
  'supabase/migrations/20260709120000_club_iskra_learning.sql',
  'supabase/migrations/20260710120000_club_iskra_settings_spark_brief.sql',
  'supabase/migrations/20260713120000_club_iskra_dispatch.sql',
  'supabase/migrations/20260714120000_club_iskra_dispatch_tasks.sql',
  'supabase/migrations/20260715120000_club_iskra_dispatch_source_channel.sql',
  'supabase/migrations/20260716120100_user_push_subscriptions.sql',
  'supabase/migrations/20260717120000_club_iskra_dispatch_recurrence.sql',
  'supabase/migrations/20260718120000_club_iskra_dispatch_stages.sql',
  'supabase/migrations/20260715120100_club_iskra_outreach_templates.sql',
  'supabase/migrations/20260715130000_clients_outreach_name.sql',
  'supabase/migrations/20260715140000_clients_max_chat_url.sql',
]

const VERIFY_SQL =
  "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'club_iskra_learning_signals') as learning_table, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_iskra_settings' and column_name = 'spark_brief_enabled') as spark_brief_col, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_iskra_settings' and column_name = 'outreach_templates') as outreach_templates_col, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_iskra_dispatch') as dispatch_table, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_iskra_dispatch' and column_name = 'due_at') as dispatch_due_col, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_iskra_dispatch' and column_name = 'source_channel') as dispatch_source_channel_col, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_iskra_dispatch' and column_name = 'stages_json') as dispatch_stages_col, exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_push_subscriptions') as push_subscriptions_table, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'max_chat_url') as clients_max_chat_url_col;"

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

let dbArgs
if (useLinked) {
  dbArgs = ['--linked']
} else {
  const password = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASS || ''
  if (!password) {
    fail(
      'Задайте SUPABASE_DB_PASSWORD или запустите: npm run db:migrate:iskra -- --linked',
    )
  }
  const ref =
    process.env.SUPABASE_PROJECT_REF ||
    projectRefFromUrl(process.env.VITE_SUPABASE_URL || readDotEnv('VITE_SUPABASE_URL'))
  if (!ref) fail('Не найден project ref: VITE_SUPABASE_URL или SUPABASE_PROJECT_REF')
  const dbUrl = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
  dbArgs = ['--db-url', dbUrl]
}

for (const rel of MIGRATIONS) {
  run(`apply ${rel}`, ['db', 'query', ...dbArgs, '--file', rel, '--yes'])
}

run('verify iskra migrations', ['db', 'query', ...dbArgs, VERIFY_SQL, '--yes'])
console.log('\nIskra migrations applied.')
