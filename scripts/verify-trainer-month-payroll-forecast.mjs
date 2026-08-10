/**
 * node scripts/verify-trainer-month-payroll-forecast.mjs
 */
import {
  averageSessionRateAtLevel,
  collectTrainerMonthTrainingFacts,
  forecastTrainerMonthPayroll,
} from '../src/lib/admin/trainerMonthPayrollForecastCore.js'
import { indexTrainerPayProfilesByTrainerId } from '../src/lib/admin/trainerPayProfileCore.js'
import { resolvePayrollFromHoursPace } from '../src/lib/admin/clubFinanceForecastCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const types = [
  {
    id: 't1',
    trainer_pay_per_session: 200,
    trainer_pay_l1: 200,
    trainer_pay_l2: 350,
    trainer_pay_l3: 500,
    counts_toward_pay_plan: true,
  },
]

const profiles = indexTrainerPayProfilesByTrainerId([
  { trainer_id: 'tr-on', club_id: 'c1', on_plan: true, rate_adjustment_rub: 0 },
  { trainer_id: 'tr-off', club_id: 'c1', on_plan: false, rate_adjustment_rub: 100 },
])

const monthRows = [
  {
    report_date: '2026-08-01',
    trainings_matrix: [
      { trainer_id: 'tr-on', membership_type_id: 't1', count: 40 },
      { trainer_id: 'tr-off', membership_type_id: 't1', count: 10 },
    ],
  },
]

const facts = collectTrainerMonthTrainingFacts(monthRows, types)
ok(facts.get('tr-on')?.payableHours === 40 && facts.get('tr-on')?.planWorkouts === 40, 'collect on-plan hours')
ok(facts.get('tr-off')?.payableHours === 10, 'collect off-plan hours')
ok(!facts.has('__club__'), 'club aggregate skipped')

const typeById = new Map(types.map((t) => [t.id, t]))
ok(averageSessionRateAtLevel(facts.get('tr-on'), typeById, 1, 0) === 200, 'avg L1')
ok(averageSessionRateAtLevel(facts.get('tr-on'), typeById, 2, 0) === 350, 'avg L2')
ok(averageSessionRateAtLevel(facts.get('tr-off'), typeById, 3, 100) === 600, 'avg L3+adj')

// Факт 50 часов; прогноз клуба 155 (×3.1) → on: 40→124 plan workouts → L3; off: L3+adj
const fc = forecastTrainerMonthPayroll({
  monthRows,
  membershipTypes: types,
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: profiles,
  clubId: 'c1',
  forecastClubHours: 155,
  factClubHours: 50,
  factPayroll: 40 * 200 + 10 * 600,
  fallbackPayroll: 999,
})

ok(fc.method === 'payroll_from_projected_tiers', 'method projected tiers')
const on = fc.byTrainer.get('tr-on')
const off = fc.byTrainer.get('tr-off')
ok(on?.levelProjected === 3 && on?.planWorkoutsProjected === 124, 'on-plan projects to L3')
ok(off?.levelProjected === 3 && off?.ratePerSession === 600, 'off-plan L3+adj')
ok(Math.abs(on.forecastHours + off.forecastHours - 155) < 0.02, 'hours normalize to club forecast')
ok(fc.payroll === roundExpected(on, off), 'payroll = sum trainers')

function roundExpected(a, b) {
  return Math.round((a.payroll + b.payroll) * 100) / 100
}

// Без разбивки по тренерам → pace fallback
const clubOnly = forecastTrainerMonthPayroll({
  monthRows: [
    {
      report_date: '2026-08-01',
      trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 50 }],
    },
  ],
  membershipTypes: types,
  forecastClubHours: 155,
  factClubHours: 50,
  factPayroll: 10000,
  fallbackPayroll: 1,
})
ok(clubOnly.method === 'payroll_from_hours', 'club-only → hours pace')
ok(
  clubOnly.payroll ===
    resolvePayrollFromHoursPace({
      factHours: 50,
      factPayroll: 10000,
      forecastHours: 155,
      fallbackPayroll: 1,
    }).payroll,
  'club-only matches resolvePayrollFromHoursPace',
)

// ISOLATE: projected tiers ≥ frozen avg when level rises
const paceSame = resolvePayrollFromHoursPace({
  factHours: 50,
  factPayroll: 40 * 200 + 10 * 600, // 8000+6000=14000
  forecastHours: 155,
  fallbackPayroll: 0,
})
ok(fc.payroll > paceSame.payroll, 'ISOLATE: tier forecast > frozen avg when coaches climb levels')

if (failed) process.exit(1)
console.log('\nverify-trainer-month-payroll-forecast: all passed')
