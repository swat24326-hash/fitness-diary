/**
 * Сводка объёма данных в Supabase — пороги docs/DATA_VOLUME.md и docs/GROWTH_PLAYBOOK.md.
 * node scripts/check-data-volume.mjs
 *
 * Нужен SUPABASE_SERVICE_ROLE_KEY в .env или supabase login + api-keys.
 */
import { createSupabaseAdmin } from './lib/qaSupabaseAdmin.mjs'

const THRESHOLDS = {
  clientsComfort: 2000,
  clientsAttention: 5000,
  trainingsComfort: 20000,
  trainingsAttention: 50000,
}

let failed = 0

function warn(msg) {
  console.warn(`⚠ ${msg}`)
}

function tierLabel(value, comfort, attention) {
  if (value >= attention) return 'ВНИМАНИЕ (фаза 4 / Pro)'
  if (value >= comfort) return 'зона внимания'
  return 'норма'
}

async function headCount(admin, table, filter) {
  let q = admin.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

async function main() {
  const admin = createSupabaseAdmin()

  const [clubsN, clientsN, trainingsN, membershipsN, trainersN] = await Promise.all([
    headCount(admin, 'clubs'),
    headCount(admin, 'clients'),
    headCount(admin, 'trainings'),
    headCount(admin, 'memberships'),
    headCount(admin, 'users', (q) => q.in('role', ['trainer', 'тренер']).eq('is_active', true)),
  ])

  const { data: clubs, error: clubsErr } = await admin.from('clubs').select('id, name').order('name')
  if (clubsErr) throw clubsErr

  console.log('\n=== Fitness Diary — объём данных ===\n')
  console.log(`Клубов:      ${clubsN}`)
  console.log(`Тренеров:    ${trainersN} (активных)`)
  console.log(`Клиентов:    ${clientsN}`)
  console.log(`Тренировок:  ${trainingsN}`)
  console.log(`Абонементов: ${membershipsN}`)

  let maxClients = 0
  let maxTrainings = 0
  let maxClubName = '—'

  console.log('\n--- по клубам ---')
  for (const club of clubs ?? []) {
    const cid = club.id
    const [cCnt, tCnt] = await Promise.all([
      headCount(admin, 'clients', (q) => q.eq('club_id', cid)),
      headCount(admin, 'trainings', (q) => q.eq('club_id', cid)),
    ])
    const name = String(club.name ?? cid).trim() || cid
    console.log(
      `${name}: клиентов ${cCnt} (${tierLabel(cCnt, THRESHOLDS.clientsComfort, THRESHOLDS.clientsAttention)}), ` +
        `тренировок ${tCnt} (${tierLabel(tCnt, THRESHOLDS.trainingsComfort, THRESHOLDS.trainingsAttention)})`,
    )
    if (tCnt > maxTrainings || (tCnt === maxTrainings && cCnt > maxClients)) {
      maxTrainings = tCnt
      maxClients = cCnt
      maxClubName = name
    }
  }

  console.log('\n--- рекомендации ---')
  if (maxTrainings >= THRESHOLDS.trainingsAttention) {
    warn(`Клуб «${maxClubName}»: ≥${THRESHOLDS.trainingsAttention} тренировок — готовить фазу 4 (RPC/pull по окну).`)
  } else if (maxTrainings >= THRESHOLDS.trainingsComfort) {
    warn(`Клуб «${maxClubName}»: профилировать Sync и club-stats.`)
  } else {
    console.log('✓ Объём данных в комфортной зоне для Free/Hobby.')
  }

  if (clubsN >= 5) {
    warn('≥5 клубов — рассмотреть Supabase Pro (бэкапы, egress).')
  }

  console.log('\nРазмер БД: Supabase Dashboard → Database → size (или SQL pg_database_size).')
  console.log('Журнал роста: docs/GROWTH_PLAYBOOK.md\n')
}

try {
  await main()
} catch (e) {
  console.error('check-data-volume failed:', e?.message ?? e)
  failed++
}

if (failed) process.exit(1)
