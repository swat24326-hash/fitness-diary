/**
 * node scripts/verify-trainer-day-payroll-forecast.mjs
 */
import {
  computeDayPayrollForecastFromInputMap,
  computeTrainerDayPayrollForecast,
  mergeMtdWorkoutsForReportDay,
  sumDayPayAtLevel,
} from '../src/lib/admin/trainerDayPayrollForecastCore.js'
import {
  computePeriodPayrollForecastFromTypeStats,
  elapsedDaysInPeriod,
  inclusiveDayCount,
  projectWorkoutsToPeriodEnd,
} from '../src/lib/admin/trainerPeriodPayrollForecastCore.js'
import { salesTrainingCellKey } from '../src/lib/admin/salesTrainingsMatrix.js'
import { indexTrainerPayProfilesByTrainerId } from '../src/lib/admin/trainerPayProfileCore.js'
import {
  computePayrollFromMatrixRows,
  sumWorkoutsByTrainerFromMatrixRows,
} from '../src/lib/admin/trainerPayrollCore.js'

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
  {
    id: 't2',
    trainer_pay_per_session: 100,
    trainer_pay_l1: 100,
    trainer_pay_l2: 150,
    trainer_pay_l3: 200,
    counts_toward_pay_plan: true,
  },
]

const typeById = new Map(types.map((t) => [t.id, t]))
const at1 = sumDayPayAtLevel([{ membership_type_id: 't1', count: 2 }], typeById, 1, 0)
ok(at1.baseRub === 400 && at1.totalRub === 400 && at1.payableCount === 2, 'base L1 no adj')

const atAdj = sumDayPayAtLevel([{ membership_type_id: 't1', count: 2 }], typeById, 1, 100)
ok(atAdj.baseRub === 400 && atAdj.totalRub === 600, 'adj +100 × 2')

const profiles = indexTrainerPayProfilesByTrainerId([
  { trainer_id: 'tr-on', club_id: 'c1', on_plan: true, rate_adjustment_rub: 0 },
  { trainer_id: 'tr-off', club_id: 'c1', on_plan: false, rate_adjustment_rub: 200 },
])

const dayRows = [
  { trainer_id: 'tr-on', membership_type_id: 't1', count: 2 },
  { trainer_id: 'tr-off', membership_type_id: 't1', count: 1 },
  { trainer_id: 'tr-off', membership_type_id: 't2', count: 1 },
]

const workouts = new Map([
  ['tr-on', 90],
  ['tr-off', 10],
])

const dayFc = computeTrainerDayPayrollForecast({
  dayRows,
  membershipTypes: types,
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: profiles,
  workoutsByTrainer: workouts,
  clubId: 'c1',
})

const on = dayFc.byTrainer.get('tr-on')
ok(on?.level === 2 && on?.baseRub === 700, 'on-plan MTD 90 → L2 base 2×350')
ok(on?.scenarios == null, 'on-plan no scenarios')

const off = dayFc.byTrainer.get('tr-off')
ok(off?.level === 3 && off?.baseRub === 700, 'off-plan base L3: 500+200')
ok(off?.totalRub === 1100, 'off-plan +200 adj on 2 payable')
ok(off?.scenarios?.l1 === 300 && off?.scenarios?.l2 === 500 && off?.scenarios?.l3 === 700, 'off-plan scenarios')

ok(dayFc.clubTotalRub === on.totalRub + off.totalRub, 'club = sum trainers')

const mtd = mergeMtdWorkoutsForReportDay(
  [
    {
      report_date: '2026-08-01',
      trainings_matrix: [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 80 }],
    },
    {
      report_date: '2026-08-10',
      trainings_matrix: [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 5 }],
    },
  ],
  '2026-08-10',
  [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 10 }],
  types,
)
ok(mtd.get('tr-on') === 90, 'MTD skips same day from monthRows, uses live day')

const inputMap = {
  [salesTrainingCellKey('tr-on', 't1')]: '2',
  [salesTrainingCellKey('tr-off', 't1')]: '1',
}
const fromMap = computeDayPayrollForecastFromInputMap({
  inputMap,
  membershipTypes: types,
  trainerIds: ['tr-on', 'tr-off'],
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: profiles,
  clubId: 'c1',
  monthRows: [
    {
      report_date: '2026-08-01',
      trainings_matrix: [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 90 }],
    },
  ],
  reportDate: '2026-08-10',
})
ok(fromMap.ok && fromMap.byTrainer.get('tr-on')?.level === 2, 'inputMap + MTD → L2')

ok(inclusiveDayCount('2026-08-01', '2026-08-31') === 31, 'Aug days')
ok(elapsedDaysInPeriod('2026-08-01', '2026-08-31', '2026-08-10') === 10, 'elapsed 10')
ok(projectWorkoutsToPeriodEnd(40, 10, 31) === 124, 'project 40/10*31')

const period = computePeriodPayrollForecastFromTypeStats({
  byTrainerByType: [
    {
      trainerId: 'tr-on',
      byType: [
        { typeId: 't1', count: 40 },
        { typeId: null, count: 3 },
      ],
    },
    {
      trainerId: 'tr-off',
      byType: [{ typeId: 't1', count: 5 }],
    },
  ],
  membershipTypes: types,
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: profiles,
  clubId: 'c1',
  dateFrom: '2026-08-01',
  dateTo: '2026-08-31',
  asOfIso: '2026-08-10',
})

const pOn = period.byTrainer.get('tr-on')
ok(pOn?.workoutsFact === 40 && pOn?.workoutsProjected === 124, 'period project on-plan')
ok(pOn?.levelProjected === 3 && pOn?.planHint.includes('ур. 3'), 'period tip L3')
ok(pOn?.baseRub === 40 * 200, 'period fact pay at L1 (40 < 80)')

const pOff = period.byTrainer.get('tr-off')
ok(pOff?.levelFact === 3 && pOff?.scenarios?.l3 === 2500, 'period off-plan scenarios')

// --- изоляция дыр / критические ветки ---

const mtdClubOnly = mergeMtdWorkoutsForReportDay(
  [
    {
      report_date: '2026-08-01',
      trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 100 }],
    },
    {
      report_date: '2026-08-05',
      trainings_matrix: [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 10 }],
    },
  ],
  '2026-08-10',
  [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 5 }],
  types,
)
ok(mtdClubOnly.get('tr-on') === 15, 'club-only prior days do not inflate trainer MTD')
ok(!mtdClubOnly.has('__club__'), 'MTD never keys __club__')

const freeType = {
  id: 'free',
  trainer_pay_per_session: 0,
  trainer_pay_l1: 0,
  trainer_pay_l2: 0,
  trainer_pay_l3: 0,
  counts_toward_pay_plan: false,
}
const paidNoPlan = {
  id: 'nop',
  trainer_pay_per_session: 300,
  trainer_pay_l1: 300,
  trainer_pay_l2: 400,
  trainer_pay_l3: 500,
  counts_toward_pay_plan: false,
}
const mixTypes = [...types, freeType, paidNoPlan]
const mixDay = computeTrainerDayPayrollForecast({
  dayRows: [
    { trainer_id: 'tr-on', membership_type_id: 't1', count: 1 },
    { trainer_id: 'tr-on', membership_type_id: 'free', count: 9 },
    { trainer_id: 'tr-on', membership_type_id: 'nop', count: 1 },
  ],
  membershipTypes: mixTypes,
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: profiles,
  workoutsByTrainer: new Map([['tr-on', 1]]),
  clubId: 'c1',
})
const mixOn = mixDay.byTrainer.get('tr-on')
ok(mixOn?.baseRub === 200 + 300, 'zero-pay skipped; paid-not-in-plan still paid')
ok(mixOn?.payableCount === 2, 'payableCount ignores zero-pay')
ok(mixOn?.level === 1, 'workouts for tier exclude free+nop from caller map')

const negAdj = computeTrainerDayPayrollForecast({
  dayRows: [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 1 }],
  membershipTypes: types,
  profilesByTrainerId: indexTrainerPayProfilesByTrainerId([
    { trainer_id: 'tr-on', club_id: 'c1', on_plan: true, rate_adjustment_rub: -500 },
  ]),
  workoutsByTrainer: new Map([['tr-on', 0]]),
  clubId: 'c1',
})
ok(negAdj.byTrainer.get('tr-on')?.baseRub === 200, 'neg adj: base unchanged')
ok(negAdj.byTrainer.get('tr-on')?.totalRub === 0, 'neg adj: total floors at 0')

const clubOnlyMap = {
  [salesTrainingCellKey('__club__', 't1')]: '3',
}
const clubOnlyFc = computeDayPayrollForecastFromInputMap({
  inputMap: clubOnlyMap,
  membershipTypes: types,
  trainerIds: [],
})
ok(clubOnlyFc.clubOnly === true && clubOnlyFc.clubBaseRub === 600, 'club-only → L1 dry 3×200')
ok(clubOnlyFc.byTrainer.size === 0, 'club-only has no per-trainer rows')

const emptyFc = computeTrainerDayPayrollForecast({
  dayRows: [],
  membershipTypes: types,
  profilesByTrainerId: profiles,
  clubId: 'c1',
})
ok(emptyFc.clubTotalRub === 0 && emptyFc.byTrainer.size === 0, 'empty day → 0')

// День≠месяц: сумма дней с прогрессивным MTD ≠ месяц по финальному уровню (изолируем семантику).
const progressiveDays = [
  { report_date: '2026-08-01', rows: [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 79 }] },
  { report_date: '2026-08-02', rows: [{ trainer_id: 'tr-on', membership_type_id: 't1', count: 1 }] },
]
let progressiveSum = 0
for (let i = 0; i < progressiveDays.length; i++) {
  const priorRows = progressiveDays.slice(0, i).flatMap((d) => d.rows)
  const dayRows = progressiveDays[i].rows
  const mtdMap = sumWorkoutsByTrainerFromMatrixRows([...priorRows, ...dayRows], types)
  const fc = computeTrainerDayPayrollForecast({
    dayRows,
    membershipTypes: types,
    planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
    profilesByTrainerId: profiles,
    workoutsByTrainer: mtdMap,
    clubId: 'c1',
  })
  progressiveSum += fc.clubTotalRub
}
const monthAllRows = progressiveDays.flatMap((d) => d.rows)
const monthFinal = computePayrollFromMatrixRows(monthAllRows, null, {
  membershipTypes: types,
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: profiles,
  clubId: 'c1',
})
ok(progressiveSum === 79 * 200 + 1 * 350, 'progressive days: day1 L1 + day2 L2')
ok(monthFinal.clubTotal === 80 * 350, 'month pays ALL at final L2')
ok(progressiveSum !== monthFinal.clubTotal, 'ISOLATE: sum(day forecasts) ≠ month payroll (by design)')

const periodNoDates = computePeriodPayrollForecastFromTypeStats({
  byTrainerByType: [{ trainerId: 'tr-on', byType: [{ typeId: 't1', count: 10 }] }],
  membershipTypes: types,
  profilesByTrainerId: profiles,
  clubId: 'c1',
})
ok(periodNoDates.daysInPeriod === 0 && periodNoDates.byTrainer.get('tr-on')?.workoutsProjected === 10, 'no dates → no inflate')

const periodDone = computePeriodPayrollForecastFromTypeStats({
  byTrainerByType: [{ trainerId: 'tr-on', byType: [{ typeId: 't1', count: 50 }] }],
  membershipTypes: types,
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: profiles,
  clubId: 'c1',
  dateFrom: '2026-08-01',
  dateTo: '2026-08-31',
  asOfIso: '2026-08-31',
})
ok(periodDone.byTrainer.get('tr-on')?.workoutsProjected === 50, 'asOf=end → no project beyond fact')

if (failed) process.exit(1)
console.log('\nverify-trainer-day-payroll-forecast: all passed')

