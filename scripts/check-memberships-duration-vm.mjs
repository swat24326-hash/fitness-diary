/**
 * На ВМ через r2-vm-db-run.sh: есть ли duration_* у memberships и запись в _schema_migrations.
 */
import pg from 'pg'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'

const url = String(process.env.DATABASE_URL ?? '').trim()
if (!url) {
  console.error('Нет DATABASE_URL')
  process.exit(1)
}

const ssl = pgClientSslOption(url)
const client = new pg.Client({ connectionString: url, ...(ssl !== undefined ? { ssl } : {}) })
await client.connect()
try {
  const cols = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'memberships'
     ORDER BY 1`,
  )
  console.log('columns:', cols.rows.map((r) => r.column_name).join(', '))
  const hasUnit = cols.rows.some((r) => r.column_name === 'duration_unit')
  const hasCount = cols.rows.some((r) => r.column_name === 'duration_count')
  console.log('duration_unit:', hasUnit ? 'yes' : 'NO')
  console.log('duration_count:', hasCount ? 'yes' : 'NO')
  const mig = await client.query(
    `SELECT id, applied_at FROM _schema_migrations
     WHERE id LIKE '%memberships_duration%' OR id LIKE '%20261116120000%'
     ORDER BY 1`,
  )
  console.log('migration rows:', JSON.stringify(mig.rows))
} finally {
  await client.end()
}
