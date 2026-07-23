import { aggregateClubClientPeriod } from '../api/_lib/clubStatsAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const clients = [
  { id: 'c1', name: 'Иванов' },
  { id: 'c2', name: 'Петров' },
  { id: 'c3', name: 'Сидоров' },
  { id: 'c4', name: 'Лазутко' },
]

const memberships = [
  { client_id: 'c1', start_date: '2026-05-01', end_date: '2026-05-15', total_trainings: 12, used_trainings: 12 },
  { client_id: 'c2', start_date: '2026-05-01', end_date: '2026-06-15', total_trainings: 12, used_trainings: 3 },
  {
    client_id: 'c3',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    total_trainings: 12,
    used_trainings: 0,
  },
  { client_id: 'c4', start_date: '2026-05-01', end_date: '2026-06-30', total_trainings: 12, used_trainings: 12 },
]

const r = aggregateClubClientPeriod(clients, memberships, '2026-05-01', '2026-05-31', '2026-05-31')

ok(r.totalClients === 4, 'total clients')
ok(r.activeWithMembership === 1, 'c2 active on end of may')
ok(r.inactiveInPeriod === 2, 'c1 expired, c4 depleted; c3 ждёт старт — не в неактивных')
ok(r.inactiveClients.length === 2, 'inactive list size')
ok(r.inactiveClients.some((c) => c.id === 'c1' && c.inactiveReason === 'expired'), 'c1 end in may -> expired on 31.05')
ok(
  r.inactiveClients.some((c) => c.id === 'c1' && c.inactiveDetail?.includes('15.05.2026')),
  'c1 detail has end date',
)
ok(r.inactiveClients.some((c) => c.id === 'c4' && c.inactiveReason === 'depleted'), 'c4 depleted but june end -> inactive')
ok(
  r.inactiveClients.some((c) => c.id === 'c4' && c.inactiveDetail?.includes('12/12')),
  'c4 detail has usage',
)
ok(!r.inactiveClients.some((c) => c.id === 'c3'), 'c3 not_started excluded from inactive')
ok(r.notRenewedInPeriod === 0, 'notRenewed deprecated empty')

const withTrainer = [
  { id: 'c1', name: 'Иванов', trainer_id: 'trainer-a' },
  { id: 'c2', name: 'Петров', trainer_id: 'trainer-b' },
  { id: 'c3', name: 'Сидоров' },
  { id: 'c4', name: 'Лазутко', trainer_id: 'trainer-a' },
]
const rTr = aggregateClubClientPeriod(withTrainer, memberships, '2026-05-01', '2026-05-31', '2026-05-31')
ok(rTr.inactiveClients.find((c) => c.id === 'c1')?.trainerId === 'trainer-a', 'inactive carries trainerId')
ok(!rTr.inactiveClients.some((c) => c.id === 'c3'), 'not_started not listed inactive')

const withArchived = [
  ...clients,
  { id: 'c5', name: 'Архивный', archived_at: '2026-06-01T00:00:00Z' },
]
const rArch = aggregateClubClientPeriod(withArchived, memberships, '2026-05-01', '2026-05-31', '2026-05-31')
ok(rArch.totalClients === 4, 'archived excluded from totalClients')
ok(!rArch.inactiveClients.some((c) => c.id === 'c5'), 'archived not in inactive list')

const juneClient = [{ id: 'maria', name: 'Шах Мария' }]
const juneMem = [
  { client_id: 'maria', start_date: '2026-05-29', end_date: '2026-06-29', total_trainings: 8, used_trainings: 2 },
]
const rJuneMid = aggregateClubClientPeriod(juneClient, juneMem, '2026-06-01', '2026-06-30', '2026-06-10')
ok(rJuneMid.activeWithMembership === 1, 'vip until 29.06 — active in june (not on 30th only)')
ok(rJuneMid.inactiveInPeriod === 0, 'not in inactive mid-june')

const rJuneEnd = aggregateClubClientPeriod(juneClient, juneMem, '2026-06-01', '2026-06-30', '2026-06-30')
ok(rJuneEnd.activeWithMembership === 1, 'still active when period ends 30.06 but membership ends 29.06')

const futureMem = [
  { client_id: 'late', start_date: '2026-06-15', end_date: '2026-06-30', total_trainings: 8, used_trainings: 0 },
]
const rEarlyJune = aggregateClubClientPeriod([{ id: 'late', name: 'Будущий' }], futureMem, '2026-06-01', '2026-06-30', '2026-06-05')
ok(rEarlyJune.activeWithMembership === 0, 'membership not started on 05.06')
ok(rEarlyJune.inactiveInPeriod === 0, 'ждёт старт — не в неактивных')
ok(rEarlyJune.inactiveClients.length === 0, 'empty inactive when only upcoming')

const gapClient = [{ id: 'gap', name: 'Gap' }]
const gapMem = [
  { client_id: 'gap', start_date: '2026-01-01', end_date: '2026-06-01', total_trainings: 10, used_trainings: 10 },
  { client_id: 'gap', start_date: '2026-06-20', end_date: '2026-07-20', total_trainings: 8, used_trainings: 0 },
]
const rGap = aggregateClubClientPeriod(gapClient, gapMem, '2026-06-01', '2026-06-30', '2026-06-10')
ok(rGap.activeWithMembership === 0, 'gap: no usable mid-june')
ok(rGap.inactiveInPeriod === 0, 'gap: upcoming next card — not inactive')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll club-client-period checks passed.')
