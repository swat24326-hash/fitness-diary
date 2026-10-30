/**
 * На ВМ через r2-vm-db-run.sh: какие миграции АЗ уже в _schema_migrations.
 * Локально не гонять без DATABASE_URL.
 */
import pg from 'pg'

const NEED = [
  'migrations/20261109120000_client_az_instructors.sql',
  'migrations/20261111120000_chat_az_instructor.sql',
  'migrations/20261112120000_trainer_schedule_direction.sql',
  'migrations/20261113120000_client_progress_self.sql',
]

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Нет DATABASE_URL')
  process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()
const { rows } = await client.query('SELECT id FROM _schema_migrations WHERE id = ANY($1::text[]) ORDER BY 1', [
  NEED,
])
const have = new Set(rows.map((r) => r.id))
for (const id of NEED) {
  console.log(have.has(id) ? `ok: ${id}` : `MISSING: ${id}`)
}
const missing = NEED.filter((id) => !have.has(id))
await client.end()
if (missing.length) {
  console.error(`\nне хватает ${missing.length} миграций — нужен r2-pg-migrate-vm.sh`)
  process.exit(1)
}
console.log('\nAZ migrations: all applied')
