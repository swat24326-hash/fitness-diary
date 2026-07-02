import {
  aggregateMonthFromDailyRows,
  computeNetProfit,
  computeProfitDay,
  dailyFormToPayload,
  monthDateRange,
  monthPartsFromIso,
  planProgressPercent,
  planFormToPayload,
} from '../src/lib/admin/salesReportCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(computeProfitDay(100, 200, 50) === 350, 'profit_day sum')
ok(computeNetProfit(350, 100) === 250, 'net profit')
ok(planProgressPercent(500, 1000) === 50, 'plan 50%')
ok(planProgressPercent(500, 0) === 0, 'plan zero denominator')

const parts = monthPartsFromIso('2026-06-15')
ok(parts?.year === 2026 && parts?.month === 6, 'month parts')
const range = monthDateRange(2026, 6)
ok(range.start === '2026-06-01' && range.end === '2026-06-30', 'june range')

const formOk = dailyFormToPayload({
  profit_nk: '1 000',
  profit_dk: '500,5',
  profit_uk: '0',
  pnk_total: '3',
  trainings_count: '12',
  pz_nk: '1',
  pz_dk: '0',
  pz_uk: '0',
  tz_nk: '0',
  tz_dk: '2',
  tz_uk: '0',
  az_nk: '0',
  az_dk: '0',
  az_uk: '1',
})
ok(formOk.ok && formOk.payload.profit_nk === 1000, 'parse money nk')
ok(formOk.ok && formOk.payload.profit_dk === 500.5, 'parse money dk')
ok(formOk.ok && formOk.payload.tz_dk === 2, 'matrix count')

const agg = aggregateMonthFromDailyRows([
  { profit_nk: 100, profit_dk: 50, profit_uk: 0, trainings_count: 5 },
  { profit_nk: 200, profit_dk: 0, profit_uk: 10, trainings_count: 3 },
])
ok(agg.profitTotal === 360, 'month profit total')
ok(agg.profitNk === 300, 'month nk')
ok(agg.trainingsTotal === 8, 'month trainings')
ok(agg.dayCount === 2, 'month days')

const planOk = planFormToPayload({ plan_total: '2 000 000', plan_pz: '0', plan_tz: '0', plan_az: '0' })
ok(planOk.ok && planOk.payload.plan_total === 2000000, 'plan parse')

const matrixOk = dailyFormToPayload(
  {
    profit_nk: '0',
    profit_dk: '0',
    profit_uk: '0',
    pnk_total: '0',
    pz_nk: '0',
    pz_dk: '0',
    pz_uk: '0',
    tz_nk: '0',
    tz_dk: '0',
    tz_uk: '0',
    az_nk: '0',
    az_dk: '0',
    az_uk: '0',
  },
  {
    matrixInput: { 'tr1|type1': '2', 'tr1|type2': '1', 'tr2|__none__': '3' },
    trainerIds: ['tr1', 'tr2'],
    membershipTypes: [{ id: 'type1' }, { id: 'type2' }],
  },
)
ok(matrixOk.ok && matrixOk.payload.trainings_count === 6, 'matrix sum trainings_count')
ok(matrixOk.ok && matrixOk.payload.trainings_matrix.length === 3, 'matrix rows stored')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll club-sales-profit checks passed.')
