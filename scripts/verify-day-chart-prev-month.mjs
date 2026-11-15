import {
  alignPrevMonthValuesByDayOfMonth,
  lastDayOfMonthFromIso,
  previousCalendarMonthParts,
  previousCalendarMonthRangeFromIso,
} from '../src/lib/admin/dayChartPrevMonthCore.js'
import { buildAdminClubDayChartSeries } from '../src/lib/admin/adminClubDayChartCore.js'
import { buildSalesManagerDayChartSeries } from '../src/lib/admin/salesManagerDayChartCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

ok(previousCalendarMonthParts(2026, 11)?.month === 10, 'nov → oct')
ok(previousCalendarMonthParts(2026, 1)?.year === 2025 && previousCalendarMonthParts(2026, 1)?.month === 12, 'jan → dec')

const range = previousCalendarMonthRangeFromIso('2026-11-15')
ok(range?.dateFrom === '2026-10-01' && range?.dateTo === '2026-10-31', 'oct range')

ok(lastDayOfMonthFromIso('2026-02-01') === 28, 'feb 2026 days')

const aligned = alignPrevMonthValuesByDayOfMonth(
  ['2026-11-01', '2026-11-02', '2026-11-30'],
  [
    { date: '2026-10-01', completed: 5 },
    { date: '2026-10-02', completed: 8 },
  ],
  (r) => Number(r.completed) || 0,
  { missingAs: 0, prevLastDay: 31 },
)
ok(aligned[0] === 5 && aligned[1] === 8 && aligned[2] === 0, 'align by DOM')

const shortPrev = alignPrevMonthValuesByDayOfMonth(
  ['2026-03-31'],
  [{ date: '2026-02-28', completed: 3 }],
  (r) => Number(r.completed) || 0,
  { missingAs: 0, prevLastDay: 28 },
)
ok(shortPrev[0] === null, 'mar 31 vs feb → null')

const admin = buildAdminClubDayChartSeries(
  [
    { date: '2026-11-01', completed: 10, draft: 0 },
    { date: '2026-11-02', completed: 4, draft: 0 },
  ],
  {
    todayIso: '2026-11-02',
    prevByDay: [
      { date: '2026-10-01', completed: 7 },
      { date: '2026-10-02', completed: 9 },
    ],
  },
)
ok(admin.hasPrevMonth === true, 'admin has prev')
ok(admin.prevCompleted?.[0] === 7 && admin.prevCompleted?.[1] === 9, 'admin prev values')

const sales = buildSalesManagerDayChartSeries(
  [
    { date: '2026-11-01', value: 1, hasReport: true },
    { date: '2026-11-02', value: 2, hasReport: true },
  ],
  [
    { date: '2026-11-01', value: 11, hasReport: true },
    { date: '2026-11-02', value: 20, hasReport: true },
  ],
  {
    todayIso: '2026-11-02',
    prevPnkSeries: [
      { date: '2026-10-01', value: 0, hasReport: true },
      { date: '2026-10-02', value: 1, hasReport: true },
    ],
    prevTrainingsSeries: [
      { date: '2026-10-01', value: 15, hasReport: true },
      { date: '2026-10-02', value: 12, hasReport: true },
    ],
  },
)
ok(sales.hasPrevMonth === true, 'sales has prev')
ok(sales.prevTrainings?.[0] === 15 && sales.prevPnk?.[1] === 1, 'sales prev values')

console.log('verify-day-chart-prev-month: ok')
