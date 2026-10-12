/**
 * Профиль объёма прода для нагрузочного теста (docs/CAPACITY_PLAN.md, этап B): сколько у тренера клиентов,
 * тренировок за 90 дней и сколько весит тренировка. Только чтение, только агрегаты — без ПДн.
 *
 * Usage (на проде): sudo bash scripts/r2-vm-db-run.sh scripts/load-profile-vm.mjs
 */
import pg from 'pg'
import { pgClientSslOption } from '../src/lib/pgMigrateOrderCore.js'

const SQL = {
  trainers: `SELECT count(*)::int AS n FROM public.users WHERE role = 'trainer' AND is_active IS NOT FALSE`,
  clientsPerTrainer: `
    SELECT count(*)::int AS trainers, round(avg(n))::int AS avg, percentile_disc(0.9) WITHIN GROUP (ORDER BY n) AS p90, max(n) AS max
    FROM (SELECT trainer_id, count(*) AS n FROM public.clients WHERE archived_at IS NULL AND trainer_id IS NOT NULL GROUP BY trainer_id) s`,
  trainings90PerTrainer: `
    SELECT round(avg(n))::int AS avg, percentile_disc(0.9) WITHIN GROUP (ORDER BY n) AS p90, max(n) AS max
    FROM (SELECT c.trainer_id, count(*) AS n FROM public.trainings t JOIN public.clients c ON c.id = t.client_id
          WHERE t.date >= current_date - 90 AND c.archived_at IS NULL GROUP BY c.trainer_id) s`,
  trainingBytes: `
    SELECT round(avg(pg_column_size(t.*)))::int AS row_avg, round(avg(octet_length(t.data::text)))::int AS data_avg,
           percentile_disc(0.9) WITHIN GROUP (ORDER BY octet_length(t.data::text)) AS data_p90
    FROM public.trainings t WHERE t.date >= current_date - 90`,
  perClient: `
    SELECT (SELECT count(*) FROM public.memberships)::float / greatest(1, (SELECT count(*) FROM public.clients)) AS memberships,
           (SELECT count(*) FROM public.health_cards)::float / greatest(1, (SELECT count(*) FROM public.clients)) AS health_cards,
           (SELECT count(*) FROM public.client_weight_entries)::float / greatest(1, (SELECT count(*) FROM public.clients)) AS weights`,
  totals: `
    SELECT (SELECT count(*) FROM public.clients)::int AS clients, (SELECT count(*) FROM public.trainings)::int AS trainings,
           (SELECT count(*) FROM public.client_sessions WHERE revoked_at IS NULL)::int AS client_sessions`,
}

const url = String(process.env.DATABASE_URL ?? '').trim()
if (!url) {
  console.error('Нет DATABASE_URL')
  process.exit(1)
}
const ssl = pgClientSslOption(url)
const client = new pg.Client({ connectionString: url, ...(ssl !== undefined ? { ssl } : {}) })
await client.connect()
try {
  const out = {}
  for (const [key, sql] of Object.entries(SQL)) out[key] = (await client.query(sql)).rows[0]
  console.log(JSON.stringify(out, null, 2))
} finally {
  await client.end()
}
