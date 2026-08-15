/**
 * node scripts/verify-club-outreach-stats.mjs
 */
import { buildClubCallStats, buildClubSmsStats, outreachLogDayKey } from '../src/lib/admin/clubOutreachStatsCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(outreachLogDayKey('2026-08-13T10:00:00.000Z') === '2026-08-13', 'day key')
ok(outreachLogDayKey('bad') === '', 'bad day empty')

const logs = [
  {
    status: 'ok',
    outcome: 'answered',
    duration_sec: 66,
    created_at: '2026-08-13T10:00:00.000Z',
    sent_by: 'u1',
    sent_by_name: 'Анна',
    client_id: 'c1',
  },
  {
    status: 'ok',
    outcome: 'missed',
    duration_sec: 28,
    created_at: '2026-08-13T11:00:00.000Z',
    sent_by: 'u1',
    sent_by_name: 'Анна',
    client_id: 'c2',
  },
  {
    status: 'fail',
    created_at: '2026-08-12T09:00:00.000Z',
    sent_by: 'u2',
    sent_by_name: 'Борис',
    client_id: 'c1',
  },
  {
    status: 'ok',
    outcome: 'short',
    duration_sec: 2,
    created_at: '2026-08-12T12:00:00.000Z',
    sent_by: null,
    sent_by_name: null,
    client_id: 'c3',
  },
  {
    status: 'ok',
    outcome: 'pending',
    created_at: '2026-08-13T12:00:00.000Z',
    sent_by: 'u1',
    sent_by_name: 'Анна',
    client_id: 'c1',
  },
]

const callStats = buildClubCallStats(logs)
ok(callStats.total === 5, 'call total')
ok(callStats.answered === 1 && callStats.missed === 1 && callStats.short === 1, 'outcomes')
ok(callStats.pending === 1 && callStats.fail === 1, 'pending+fail')
ok(callStats.successful === 1 && callStats.unsuccessful === 2, 'success buckets')
ok(callStats.connect_rate_pct === 33, 'connect rate 1/3')
ok(callStats.unique_clients === 3 && callStats.clients_repeat === 1, 'clients + repeat')
ok(callStats.talk_sec_total === 66 && callStats.talk_sec_avg === 66, 'talk time')
ok(callStats.by_sender[0].name === 'Анна' && callStats.by_sender[0].total === 3, 'top sender Anna')
ok(callStats.by_sender[0].answered === 1 && callStats.by_sender[0].missed === 1, 'Anna outcomes')

const smsStats = buildClubSmsStats([
  { status: 'fail', created_at: '2026-08-13T01:00:00.000Z', client_id: 'x' },
  { status: 'ok', created_at: '2026-08-13T02:00:00.000Z', client_id: 'y' },
])
ok(smsStats.ok === 1 && smsStats.fail === 1, 'sms stats')
ok(smsStats.by_day.length === 1, 'sms by day')

if (failed) process.exit(1)
console.log('verify-club-outreach-stats: all passed')
