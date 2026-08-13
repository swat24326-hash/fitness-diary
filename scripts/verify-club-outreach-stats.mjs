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
    created_at: '2026-08-13T10:00:00.000Z',
    sent_by: 'u1',
    sent_by_name: 'Анна',
    client_id: 'c1',
  },
  {
    status: 'ok',
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
    created_at: '2026-08-12T12:00:00.000Z',
    sent_by: null,
    sent_by_name: null,
    client_id: 'c3',
  },
]

const callStats = buildClubCallStats(logs)
ok(callStats.total === 4 && callStats.ok === 3 && callStats.fail === 1, 'call totals')
ok(callStats.unique_clients === 3, 'unique clients')
ok(callStats.by_day.length === 2, 'two days')
ok(callStats.by_day[0].day === '2026-08-13' && callStats.by_day[0].ok === 2, 'newest day first')
ok(callStats.by_sender[0].name === 'Анна' && callStats.by_sender[0].total === 2, 'top sender Anna')

const smsStats = buildClubSmsStats([
  { status: 'fail', created_at: '2026-08-13T01:00:00.000Z', client_id: 'x' },
  { status: 'ok', created_at: '2026-08-13T02:00:00.000Z', client_id: 'y' },
])
ok(smsStats.ok === 1 && smsStats.fail === 1, 'sms stats')

if (failed) process.exit(1)
console.log('verify-club-outreach-stats: all passed')
