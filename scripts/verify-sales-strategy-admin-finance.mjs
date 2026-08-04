import {
  MIN_REPORT_DAYS_FOR_FORECAST,
  MIN_REFUND_POSITIVE_DAYS_FOR_PACE,
  resolveForecastRefunds,
  resolvePayrollFromHoursPace,
} from '../src/lib/admin/clubFinanceForecastCore.js'
import { buildStrategyAdminFinanceBar } from '../src/lib/admin/salesStrategyAdminFinanceCore.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

ok(MIN_REFUND_POSITIVE_DAYS_FOR_PACE === 2, 'min refund positive days = 2')

const sparse = resolveForecastRefunds({
  monthRows: [
    { refunds_amount: 100 },
    { refunds_amount: 0 },
    { refunds_amount: 0 },
  ],
  year: 2026,
  month: 7,
  factRefunds: 100,
})
ok(sparse.paced === false && sparse.forecastRefunds === 100, 'sparse refunds stay fact')

const paced = resolveForecastRefunds({
  monthRows: [
    { report_date: '2026-07-01', refunds_amount: 100 },
    { report_date: '2026-07-02', refunds_amount: 200 },
    { report_date: '2026-07-03', refunds_amount: 300 },
  ],
  year: 2026,
  month: 7,
  factRefunds: 600,
})
ok(paced.paced === true && paced.forecastRefunds > 600, 'paced refunds above fact')

const pay = resolvePayrollFromHoursPace({
  factHours: 10,
  factPayroll: 5000,
  forecastHours: 20,
  fallbackPayroll: 999,
})
ok(pay.method === 'payroll_from_hours' && pay.payroll === 10000, 'payroll = hours × rate')

const hidden = buildStrategyAdminFinanceBar({ showAdminFinanceBar: false })
ok(hidden.visible === false, 'hidden for non-admin')

const today = new Date(2026, 6, 15)
const rows = [
  {
    report_date: '2026-07-01',
    profit_nk: 10000,
    profit_dk: 0,
    profit_uk: 0,
    refunds_amount: 100,
    trainings_matrix: [{ trainer_id: 't1', membership_type_id: 'm1', count: 2 }],
    aerobic_sales_matrix: [{ membership_type_id: 'a1', count: 1 }],
  },
  {
    report_date: '2026-07-02',
    profit_nk: 10000,
    profit_dk: 0,
    profit_uk: 0,
    refunds_amount: 200,
    trainings_matrix: [{ trainer_id: 't1', membership_type_id: 'm1', count: 2 }],
    aerobic_sales_matrix: [{ membership_type_id: 'a1', count: 1 }],
  },
  {
    report_date: '2026-07-03',
    profit_nk: 10000,
    profit_dk: 0,
    profit_uk: 0,
    refunds_amount: 300,
    trainings_matrix: [{ trainer_id: 't1', membership_type_id: 'm1', count: 2 }],
    aerobic_sales_matrix: [{ membership_type_id: 'a1', count: 1 }],
  },
]

const types = [
  { id: 'm1', trainer_pay_per_session: 500, trainer_assignable: true },
  { id: 'a1', aerobic_pay_amount: 200, trainer_assignable: false },
]

const bar = buildStrategyAdminFinanceBar({
  showAdminFinanceBar: true,
  horizon: 'current',
  targetYear: 2026,
  targetMonth: 7,
  planMonthDays: rows,
  membershipTypes: types,
  expense: 1000,
  today,
})

ok(bar.visible && bar.ok, 'admin current bar ok')
ok(bar.mode === 'month_forecast', 'current → month forecast')
ok(bar.cells?.length === 6, 'six KPI cells')
ok(bar.forecast.pzTrainings > bar.fact.pzTrainings, 'pz hours paced up')
ok(bar.forecast.refunds > bar.fact.refunds, 'refunds paced up')
ok(bar.forecast.trainerPayroll > bar.fact.trainerPayroll, 'pz payroll paced')
ok(typeof bar.forecast.netProfit === 'number', 'net profit present')

const few = buildStrategyAdminFinanceBar({
  showAdminFinanceBar: true,
  horizon: 'current',
  targetYear: 2026,
  targetMonth: 7,
  planMonthDays: rows.slice(0, 2),
  today,
})
ok(!few.ok && few.reason === 'insufficient_reports', 'needs min reports')
ok(few.minReportDays === MIN_REPORT_DAYS_FOR_FORECAST, 'min days constant')

const nextBar = buildStrategyAdminFinanceBar({
  showAdminFinanceBar: true,
  horizon: 'next',
  targetYear: 2026,
  targetMonth: 8,
  baseYear: 2026,
  baseMonth: 6,
  prevMonthDays: [
    { report_date: '2026-06-01', profit_nk: 5000, refunds_amount: 0 },
    { report_date: '2026-06-02', profit_nk: 5000, refunds_amount: 0 },
    { report_date: '2026-06-03', profit_nk: 5000, refunds_amount: 50 },
  ],
  expense: 0,
  today,
})
ok(nextBar.ok && nextBar.mode === 'base_fact', 'next horizon uses base fact')
ok(nextBar.closedMonth === true, 'base month closed')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales-strategy-admin-finance checks passed')
