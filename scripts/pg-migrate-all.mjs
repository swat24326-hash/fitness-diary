/**
 * Применить schema + migrations (+ опционально policies) к bare Postgres (DATABASE_URL).
 * Для стенда C2 / Yandex Managed PG. Прод Supabase — по-прежнему db:migrate:* через CLI.
 *
 * Usage: DATABASE_URL=postgres://... npm run db:migrate:pg
 * Flags:
 *   --dry-run         только план
 *   --with-policies   применить policies.sql (по умолчанию пропускаем — на C2 опора API, не RLS)
 *   --skip-policies   устаревший синоним «без policies» (это и так дефолт)
 */
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  buildPgMigratePlan,
  filterPendingMigrateSteps,
  pgClientSslOption,
  sortMigrationFilenames,
} from '../src/lib/pgMigrateOrderCore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SUPABASE_DIR = join(ROOT, 'supabase')

const dryRun = process.argv.includes('--dry-run')
const withPolicies = process.argv.includes('--with-policies')
const skipPolicies = !withPolicies

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function loadApplied(client) {
  const { rows } = await client.query('SELECT id FROM _schema_migrations')
  return rows.map((r) => String(r.id))
}

async function applySqlFile(client, absPath, id) {
  const sql = await readFile(absPath, 'utf8')
  if (!sql.trim()) {
    console.log(`skip empty: ${id}`)
    return
  }
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('INSERT INTO _schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id])
    await client.query('COMMIT')
    console.log(`ok: ${id}`)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }
}

async function main() {
  const migrationNames = sortMigrationFilenames(await readdir(join(SUPABASE_DIR, 'migrations')))
  const plan = buildPgMigratePlan({
    hasAuthStub: true,
    hasSchema: true,
    migrationFiles: migrationNames,
    hasPolicies: !skipPolicies,
  })

  console.log(
    `plan: ${plan.length} steps (auth stub + schema + ${migrationNames.length} migrations${skipPolicies ? '' : ' + policies'})`,
  )
  if (skipPolicies) {
    console.log('note: policies.sql skipped (default). Pass --with-policies if you need RLS on bare PG.')
  }

  if (dryRun) {
    for (const s of plan) console.log(`  - ${s.id}`)
    return
  }

  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) {
    console.error('Задайте DATABASE_URL (postgres://… к Managed PG).')
    process.exit(1)
  }

  const ssl = pgClientSslOption(databaseUrl)
  const client = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await client.connect()
  try {
    await ensureMigrationsTable(client)
    const applied = await loadApplied(client)
    // auth stub всегда переприменяем (идемпотентный SQL), затем учитываем в таблице
    const stubStep = plan.find((s) => s.kind === 'auth_stub')
    if (stubStep) {
      await applySqlFile(client, join(SUPABASE_DIR, stubStep.file), stubStep.id)
    }
    const pending = filterPendingMigrateSteps(
      plan.filter((s) => s.kind !== 'auth_stub'),
      applied,
    )
    if (!pending.length) {
      console.log('nothing to apply — already up to date')
      return
    }
    console.log(`pending: ${pending.length}`)
    for (const step of pending) {
      const abs = join(SUPABASE_DIR, step.file)
      await applySqlFile(client, abs, step.id)
    }
    console.log('db:migrate:pg done')
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
