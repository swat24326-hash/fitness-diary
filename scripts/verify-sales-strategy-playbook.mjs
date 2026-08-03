import {
  bucketEndingsByWeek,
  buildMonthWeekBuckets,
  buildStrategyPlaybook,
  isoInWeek,
  paceWeekTargets,
  packNkUkShares,
  resolveActiveWeekIndex,
  sumFactRubInRange,
  weekProgress,
} from '../src/lib/admin/salesStrategyPlaybookCore.js'
import { endingRowsFromRenewalsSuggest } from '../src/lib/admin/salesStrategyPlaybookService.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const weeks = buildMonthWeekBuckets(2026, 7)
ok(weeks.length >= 4 && weeks.length <= 6, 'july has 4–6 week buckets')
ok(weeks[0].startIso === '2026-07-01', 'july starts day 1')
ok(weeks[weeks.length - 1].endIso === '2026-07-31', 'july ends day 31')
ok(isoInWeek('2026-07-15', weeks.find((w) => w.startIso <= '2026-07-15' && w.endIso >= '2026-07-15')), 'mid july in a week')

const equal = paceWeekTargets(100000, weeks, weeks.map(() => 0))
ok(Math.abs(equal.reduce((a, b) => a + b, 0) - 100000) < 1, 'equal pace sums to pack')
const skewed = paceWeekTargets(
  100000,
  weeks,
  weeks.map((_, i) => (i === 1 ? 10 : 0)),
)
ok(skewed[1] > skewed[0], 'week with more endings gets higher target')
ok(Math.abs(skewed.reduce((a, b) => a + b, 0) - 100000) < 1, 'skewed pace sums to pack')

const buckets = bucketEndingsByWeek(
  [
    { clientId: 'a', clientName: 'Аня', hall: 'pz', endDate: '2026-07-03', amount: 8000 },
    { clientId: 'b', clientName: 'Боря', hall: 'tz', endDate: '2026-07-20', amount: 7000 },
    { clientId: 'c', endDate: '2026-06-01', amount: 1 },
  ],
  weeks,
)
const totalBucketed = buckets.reduce((a, b) => a + b.length, 0)
ok(totalBucketed === 2, 'only month endings bucketed')
ok(buckets.some((b) => b.some((r) => r.clientName === 'Аня')), 'anya in a week')

const prog = weekProgress(50000, 100000)
ok(prog.pct === 50 && prog.gap === 50000, 'week progress 50%')

const fact = sumFactRubInRange(
  [
    { report_date: '2026-07-02', profit_day: 1000 },
    { report_date: '2026-07-10', profit_day: 2000 },
    { report_date: '2026-08-01', profit_day: 9999 },
  ],
  '2026-07-01',
  '2026-07-07',
)
ok(fact === 1000, 'fact only in week range')

ok(resolveActiveWeekIndex(weeks, '2026-07-01') === 0, 'active first week')
ok(resolveActiveWeekIndex(weeks, '2026-08-01') === weeks.length - 1, 'after month → last week')

const shares = packNkUkShares({
  byHall: { pz: { nk: 60, uk: 40 }, tz: { nk: 0, uk: 0 }, az: { nk: 0, uk: 0 } },
})
ok(Math.abs(shares.nkShare - 0.6) < 1e-9, 'nk share from pack')

const playbook = buildStrategyPlaybook({
  year: 2026,
  month: 7,
  todayIso: '2026-07-10',
  packTotal: 1200000,
  pack: {
    totalAmount: 1200000,
    byHall: {
      pz: { nk: 200000, uk: 200000 },
      tz: { nk: 50000, uk: 50000 },
      az: { nk: 30000, uk: 20000 },
    },
  },
  endingRows: [
    { clientId: '1', clientName: 'Клиент', hall: 'pz', endDate: '2026-07-12', amount: 8000 },
  ],
  monthDays: [{ report_date: '2026-07-09', profit_day: 15000 }],
})
ok(playbook.ok, 'playbook ok')
ok(playbook.weeks.length === weeks.length, 'playbook weeks')
ok(playbook.monthProgress.target === 1200000, 'month target = pack')
ok(playbook.weeks.some((w) => w.endingsCount === 1), 'ending in a week card')
ok(playbook.weeks.every((w) => w.nkOrient >= 0 && w.ukOrient >= 0), 'nk/uk orient non-negative')

const noPack = buildStrategyPlaybook({ year: 2026, month: 7, packTotal: 0 })
ok(!noPack.ok, 'no pack → error')

const rows = endingRowsFromRenewalsSuggest({
  renewalPct: 50,
  candidates: [
    {
      clientId: 'x',
      clientName: 'X',
      hall: 'pz',
      endDate: '2026-07-01',
      avgRub: 10000,
      phone: '+7 900',
      cardNumber: '12345',
    },
  ],
})
ok(rows[0].amount === 10000, 'ending amount = check (no renewal % on row)')
ok(rows[0].phone === '+7 900' && rows[0].cardNumber === '12345', 'ending keeps phone and card')

const paidRow = endingRowsFromRenewalsSuggest({
  renewalPct: 80,
  candidates: [
    {
      clientId: 'paid',
      hall: 'tz',
      endDate: '2026-07-09',
      avgRub: 3000,
      paidRub: 2290,
    },
  ],
})
ok(paidRow[0].amount === 2290, 'ending amount prefers membership paidRub over avg')

const mixed = endingRowsFromRenewalsSuggest({
  renewalPct: 80,
  candidates: [
    { clientId: 'open1', clientName: 'Open', hall: 'pz', endDate: '2026-07-05', avgRub: 10000 },
  ],
  confirmedClosings: [
    {
      clientId: 'done1',
      clientName: 'Done',
      hall: 'pz',
      endDate: '2026-07-12',
      avgRub: 8000,
      factAmount: 9500,
      confirmed: true,
    },
  ],
})
ok(mixed.length === 1 && mixed[0].clientId === 'open1', 'playbook rows = open only (not confirmed)')
ok(!mixed.some((r) => r.clientId === 'done1'), 'already-purchased successor not in closings list')
ok(
  endingRowsFromRenewalsSuggest({
    confirmedClosings: [
      { clientId: 'd2', hall: 'pz', endDate: '2026-07-01', avgRub: 8000, confirmed: true },
    ],
  }).length === 0,
  'confirmed-only suggest → empty closings list',
)

const mixBuckets = bucketEndingsByWeek(mixed, weeks)
const mixPlaybook = buildStrategyPlaybook({
  year: 2026,
  month: 7,
  todayIso: '2026-07-10',
  packTotal: 100000,
  pack: {
    totalAmount: 100000,
    byHall: { pz: { nk: 25000, uk: 25000 }, tz: { nk: 0, uk: 0 }, az: { nk: 0, uk: 0 } },
  },
  endingRows: mixed,
  monthDays: [],
})
ok(mixPlaybook.ok, 'playbook open-only ok')
ok(mixPlaybook.endingsConfirmedTotal === 0, 'month confirmed total 0 when not in rows')
ok(mixPlaybook.endingsOpenTotal === 1, 'month open total')
ok(
  mixPlaybook.weeks.every((w) => w.endingsConfirmedCount === 0),
  'weeks have no confirmed closings',
)

const openOnlyCounts = mixBuckets.map((b) => b.filter((r) => !r.confirmed).length)
const paceOpen = paceWeekTargets(100000, weeks, openOnlyCounts)
ok(
  Math.abs(paceOpen.reduce((a, b) => a + b, 0) - 100000) < 1,
  'pace from open counts sums to pack',
)

const deduped = endingRowsFromRenewalsSuggest({
  renewalPct: 50,
  candidates: [
    { clientId: 'same', clientName: 'Same', hall: 'pz', endDate: '2026-07-08', avgRub: 10000 },
  ],
  confirmedClosings: [
    {
      clientId: 'same',
      clientName: 'Same',
      hall: 'pz',
      endDate: '2026-07-08',
      avgRub: 9000,
      factAmount: 11000,
      confirmed: true,
    },
  ],
})
ok(deduped.length === 1 && !deduped[0].confirmed && deduped[0].amount === 10000, 'open kept; confirmed ignored in list')

if (failed) {
  console.error(`\n${failed} strategy playbook check(s) failed`)
  process.exit(1)
}
console.log('\nAll sales strategy playbook checks passed')
