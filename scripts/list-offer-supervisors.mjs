/**
 * Прод/стенд: список управляющих и статус оферты (read-only).
 * На ВМ: sudo bash scripts/r2-vm-db-run.sh scripts/list-offer-supervisors.mjs
 */
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Нет DATABASE_URL')
  process.exit(1)
}

const sql = `
SELECT
  u.login,
  coalesce(u.name, '') AS name,
  u.role::text AS role,
  coalesce(u.offer_version, '') AS offer_version,
  (u.offer_accepted_at IS NOT NULL) AS accepted,
  coalesce(c.name, '') AS club
FROM public.users u
LEFT JOIN public.clubs c ON c.id = u.club_id
WHERE lower(trim(u.role::text)) IN ('supervisor', 'управляющий')
ORDER BY accepted ASC, c.name NULLS LAST, u.login
`

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  const { rows } = await client.query(sql)
  const pending = rows.filter((r) => !r.accepted)
  const ok = rows.filter((r) => r.accepted)
  console.log(`управляющих: ${rows.length}; приняли: ${ok.length}; ждут клика: ${pending.length}`)
  for (const r of rows) {
    const mark = r.accepted ? '✓' : '·'
    console.log(`${mark} ${r.login} | ${r.club || '—'} | ${r.name || '—'} | ver=${r.offer_version || '—'}`)
  }
} finally {
  await client.end()
}
