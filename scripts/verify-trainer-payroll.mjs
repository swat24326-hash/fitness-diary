import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
  computePayrollFromMatrixRows,
  computePayrollFromMembershipStats,
  parseTrainerPayRate,
} from '../src/lib/admin/trainerPayrollCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseTrainerPayRate('800') === 800, 'parse pay rate')
ok(parseTrainerPayRate('') === 0, 'empty pay rate')
ok(Number.isNaN(parseTrainerPayRate('-1')), 'negative pay rate')

const types = [
  { id: 't1', trainer_pay_per_session: 800 },
  { id: 't2', trainer_pay_per_session: 500 },
]
const rateMap = buildTrainerPayRateMap(types)

const matrix = [
  { trainer_id: 'tr1', membership_type_id: 't1', count: 2 },
  { trainer_id: 'tr1', membership_type_id: null, count: 5 },
  { trainer_id: 'tr2', membership_type_id: 't2', count: 3 },
]
const dayPay = computePayrollFromMatrixRows(matrix, rateMap)
ok(dayPay.clubTotal === 3100, 'day club payroll')
ok(dayPay.byTrainer.get('tr1')?.total === 1600, 'trainer1 day pay')
ok(dayPay.byTrainer.get('tr2')?.total === 1500, 'trainer2 day pay')

const monthPay = aggregatePayrollFromDailyRows(
  [
    { trainings_matrix: matrix },
    { trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 't1', count: 1 }] },
  ],
  rateMap,
)
ok(monthPay.clubTotal === 3900, 'month club payroll aggregated')

ok(computeNetProfitWithPayroll(10000, 3100, 2000) === 4900, 'net profit with payroll')

const fitStats = {
  byTrainerByType: [
    {
      trainerId: 'tr1',
      byType: [
        { typeId: 't1', count: 4 },
        { typeId: null, count: 2 },
      ],
    },
  ],
}
const fitPay = computePayrollFromMembershipStats(fitStats, rateMap, { trainerIdFilter: 'tr1' })
ok(fitPay.clubTotal === 3200, 'fit-city payroll skips untyped')

process.exit(failed > 0 ? 1 : 0)
