/**
 * Диагностика: Ежедневник Анжелики — колонка kind, клуб, свежие записи.
 * Только чтение. На ВМ: sudo bash scripts/r2-vm-db-run.sh scripts/diag-coach-schedule-anzhelika.mjs
 */
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Нет DATABASE_URL')
  process.exit(1)
}

function todayMsk() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  const today = todayMsk()
  console.log('today_msk', today)

  const kindCol = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trainer_schedule_entries' AND column_name = 'kind'
  `)
  console.log('kind_column', kindCol.rowCount ? 'есть' : 'НЕТ')

  const trainers = await client.query(`
    SELECT u.id, u.name, u.login, u.role::text AS role, u.club_id, c.name AS club_name
    FROM public.users u
    LEFT JOIN public.clubs c ON c.id = u.club_id
    WHERE u.name ILIKE '%Кожемякин%'
    ORDER BY u.name
    LIMIT 20
  `)
  console.log(
    'trainers',
    trainers.rows.map((u) => ({
      id: u.id,
      name: u.name,
      login: u.login,
      role: u.role,
      club: u.club_name || '(нет)',
      club_id: u.club_id || '(пусто)',
    })),
  )

  for (const u of trainers.rows) {
    if (u.role !== 'trainer') continue
    const recent = await client.query(
      `
      SELECT id, day_date::text AS day_date, start_minutes, duration_minutes, title, client_ids, kind, club_id, created_at, updated_at
      FROM public.trainer_schedule_entries
      WHERE trainer_id = $1 AND day_date >= DATE '2026-10-15'
      ORDER BY updated_at DESC
      LIMIT 30
    `,
      [u.id],
    )
    console.log(
      `\n=== ${u.name} (${String(u.id).slice(0, 8)}) club=${u.club_name || 'EMPTY'} entries_since_10-15=${recent.rowCount} ===`,
    )
    for (const e of recent.rows.slice(0, 20)) {
      const clients = Array.isArray(e.client_ids) ? e.client_ids.length : 0
      const hh = String(Math.floor(Number(e.start_minutes) / 60)).padStart(2, '0')
      const mm = String(Number(e.start_minutes) % 60).padStart(2, '0')
      console.log(
        [
          e.day_date,
          `${hh}:${mm}`,
          `${e.duration_minutes}м`,
          `kind=${e.kind ?? 'null'}`,
          `clients=${clients}`,
          `title=${JSON.stringify(String(e.title ?? '').slice(0, 40))}`,
          `club=${e.club_id ? String(e.club_id).slice(0, 8) : 'EMPTY'}`,
          `upd=${e.updated_at?.toISOString?.() ?? e.updated_at}`,
        ].join(' | '),
      )
    }
    const todayCount = recent.rows.filter((e) => String(e.day_date).slice(0, 10) === today).length
    console.log(`today(${today}): ${todayCount} из выборки`)
  }

  const recentAll = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM public.trainer_schedule_entries
    WHERE updated_at > NOW() - INTERVAL '6 hours'
  `)
  console.log('\nentries_updated_last_6h_all_trainers', recentAll.rows[0]?.n)
} finally {
  await client.end()
}
