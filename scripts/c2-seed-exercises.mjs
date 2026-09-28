/**
 * Базовый справочник упражнений на стенд C2. Повторный запуск безопасен: ON CONFLICT (name) DO NOTHING.
 *
 * Usage (на ВМ): sudo bash scripts/r2-vm-db-run.sh scripts/c2-seed-exercises.mjs
 */
import pg from 'pg'
import { C2_SEED_EXERCISES } from '../src/lib/c2SeedCore.js'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!databaseUrl) throw new Error('Задайте DATABASE_URL (Managed PG стенда).')
  const ssl = pgClientSslOption(databaseUrl)
  const client = new pg.Client({ connectionString: databaseUrl, ...(ssl !== undefined ? { ssl } : {}) })
  await client.connect()
  try {
    let added = 0
    for (const ex of C2_SEED_EXERCISES) {
      const r = await client.query(
        'INSERT INTO public.exercises (name, muscle_group) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [ex.name, ex.muscle_group],
      )
      added += r.rowCount
    }
    const total = await client.query('SELECT count(*)::int AS n FROM public.exercises')
    console.log(`exercises ok: добавлено ${added}, всего ${total.rows[0].n}`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
