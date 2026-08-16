/**
 * Verify client outreach history range / tabs / SMS filter.
 */
import {
  CLIENT_OUTREACH_RANGE_ALL,
  CLIENT_OUTREACH_RANGE_DAY,
  clientOutreachHistorySummaryPrefix,
  filterClubSmsLogsByClientId,
  normalizeClientOutreachHistoryTab,
  normalizeClientOutreachRangeMode,
  resolveClientOutreachHistoryFetchOpts,
} from '../src/lib/admin/clientOutreachHistoryRangeCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(normalizeClientOutreachRangeMode('all') === CLIENT_OUTREACH_RANGE_ALL, 'all mode')
ok(normalizeClientOutreachRangeMode('day') === CLIENT_OUTREACH_RANGE_DAY, 'day mode')
ok(normalizeClientOutreachRangeMode('') === CLIENT_OUTREACH_RANGE_DAY, 'default day')
ok(normalizeClientOutreachHistoryTab('SMS') === 'sms', 'sms tab')
ok(normalizeClientOutreachHistoryTab('x') === 'calls', 'default calls')

const allCalls = resolveClientOutreachHistoryFetchOpts({ rangeMode: 'all', kind: 'calls' })
ok(allCalls.sinceDays === 90 && allCalls.summaryScope === 'all', 'calls all → 90d')
ok(!allCalls.day, 'calls all no day')

const dayCalls = resolveClientOutreachHistoryFetchOpts({
  rangeMode: 'day',
  day: '2026-08-16',
  kind: 'calls',
})
ok(dayCalls.day === '2026-08-16' && dayCalls.summaryScope === 'day', 'calls day')

const dayFallback = resolveClientOutreachHistoryFetchOpts({
  rangeMode: 'day',
  day: '',
  todayIso: '2026-08-01',
  kind: 'calls',
})
ok(dayFallback.day === '2026-08-01', 'day mode falls back to todayIso')

const dayBroken = resolveClientOutreachHistoryFetchOpts({
  rangeMode: 'day',
  day: 'nope',
  kind: 'calls',
})
ok(!dayBroken.day && !dayBroken.sinceDays, 'invalid day without today → no silent 14d')

const allSms = resolveClientOutreachHistoryFetchOpts({ rangeMode: 'all', kind: 'sms' })
ok(allSms.sinceDays === 90, 'sms all → 90d')

ok(clientOutreachHistorySummaryPrefix('day') === 'За день', 'prefix day')
ok(clientOutreachHistorySummaryPrefix('all', 90) === 'За 90 дн.', 'prefix all')

const filtered = filterClubSmsLogsByClientId(
  [
    { id: '1', client_id: 'a' },
    { id: '2', client_id: 'b' },
    { id: '3', client_id: 'a' },
  ],
  'a',
)
ok(filtered.length === 2 && filtered.every((r) => r.client_id === 'a'), 'sms by client')
ok(filterClubSmsLogsByClientId(filtered, '').length === 0, 'empty client → []')

console.log('\nAll client outreach history range checks passed')
