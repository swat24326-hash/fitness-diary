/**
 * Кабинет тренера: план / ±₽ и уровни ставок + ветки развития событий.
 * node scripts/verify-trainer-pay-profile.mjs
 */
import {
  coerceOnPlan,
  defaultTrainerPayProfile,
  effectiveSessionRate,
  getTrainerPayProfile,
  parseRateAdjustmentRub,
  pickMembershipTypeTierRate,
  resolveTrainerPayLevel,
  validateTrainerPayProfileForSave,
} from '../src/lib/admin/trainerPayProfileCore.js'
import { aggregatePayrollFromDailyRows, computePayrollFromMatrixRows } from '../src/lib/admin/trainerPayrollCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const plan = { workouts_l2_min: 80, workouts_l3_min: 120 }
const vip = {
  id: 'vip',
  trainer_pay_l1: 200,
  trainer_pay_l2: 350,
  trainer_pay_l3: 500,
  trainer_pay_per_session: 200,
}
const std = {
  id: 'std',
  trainer_pay_l1: 100,
  trainer_pay_l2: 150,
  trainer_pay_l3: 200,
  trainer_pay_per_session: 100,
}
const types = [vip, std]

// --- базовые ---
const def = defaultTrainerPayProfile('t1', 'c1')
ok(def.on_plan === true && def.rate_adjustment_rub === 0, 'default profile')

ok(coerceOnPlan(false) === false, 'coerceOnPlan false')
ok(coerceOnPlan('false') === false, 'coerceOnPlan "false"')
ok(coerceOnPlan('FALSE') === false, 'coerceOnPlan FALSE')
ok(coerceOnPlan(true) === true, 'coerceOnPlan true')
ok(coerceOnPlan(undefined) === true, 'coerceOnPlan default true')

ok(resolveTrainerPayLevel({ onPlan: false, workouts: 0 }) === 3, 'no plan → L3')
ok(resolveTrainerPayLevel({ onPlan: false, workouts: 999 }) === 3, 'no plan high volume still L3')
ok(resolveTrainerPayLevel({ onPlan: true, workouts: 50, planConfig: plan }) === 1, 'on plan low → L1')
ok(resolveTrainerPayLevel({ onPlan: true, workouts: 79, planConfig: plan }) === 1, 'boundary 79 → L1')
ok(resolveTrainerPayLevel({ onPlan: true, workouts: 80, planConfig: plan }) === 2, 'boundary 80 → L2')
ok(resolveTrainerPayLevel({ onPlan: true, workouts: 119, planConfig: plan }) === 2, 'boundary 119 → L2')
ok(resolveTrainerPayLevel({ onPlan: true, workouts: 120, planConfig: plan }) === 3, 'boundary 120 → L3')
ok(
  resolveTrainerPayLevel({
    onPlan: true,
    workouts: 100,
    planConfig: { hours_l2_min: 80, hours_l3_min: 120 },
  }) === 2,
  'legacy hours_* keys still work',
)

ok(pickMembershipTypeTierRate(vip, 1) === 200, 'pick L1')
ok(pickMembershipTypeTierRate(vip, 2) === 350, 'pick L2')
ok(pickMembershipTypeTierRate(vip, 3) === 500, 'pick L3')
ok(
  pickMembershipTypeTierRate({ id: 'old', trainer_pay_per_session: 250 }, 3) === 250,
  'legacy session fills missing tiers',
)

ok(effectiveSessionRate(500, 100) === 600, 'VIP +100')
ok(effectiveSessionRate(500, -200) === 300, 'VIP -200')
ok(effectiveSessionRate(100, -200) === 0, 'floor at 0')
ok(effectiveSessionRate(500, 0) === 500, 'zero adj')
ok(effectiveSessionRate(0, 100) === 0, 'zero-pay card ignores +adj')
ok(effectiveSessionRate(0, -50) === 0, 'zero-pay card ignores -adj')

ok(parseRateAdjustmentRub('-50') === -50, 'adj ascii minus')
ok(parseRateAdjustmentRub('−50') === -50, 'adj unicode minus')
ok(parseRateAdjustmentRub('100,5') === 100.5, 'adj comma decimal')
ok(parseRateAdjustmentRub('') === 0, 'adj empty → 0')
ok(parseRateAdjustmentRub('x') == null, 'adj garbage → null')

const bad = validateTrainerPayProfileForSave({ trainer_id: 't', club_id: 'c', rate_adjustment_rub: 'x' })
ok(!bad.ok, 'reject bad adjustment')
ok(!validateTrainerPayProfileForSave({ trainer_id: '', club_id: 'c', rate_adjustment_rub: 0 }).ok, 'reject no trainer')
ok(!validateTrainerPayProfileForSave({ trainer_id: 't', club_id: '', rate_adjustment_rub: 0 }).ok, 'reject no club')
ok(
  !validateTrainerPayProfileForSave({
    trainer_id: 't',
    club_id: 'c',
    rate_adjustment_rub: 100000,
  }).ok,
  'reject oversize adj',
)

const good = validateTrainerPayProfileForSave({
  trainer_id: 't1',
  club_id: 'c1',
  on_plan: false,
  rate_adjustment_rub: '-50',
})
ok(good.ok && good.profile.on_plan === false && good.profile.rate_adjustment_rub === -50, 'validate save')

const goodStr = validateTrainerPayProfileForSave({
  trainer_id: 't1',
  club_id: 'c1',
  on_plan: 'false',
  rate_adjustment_rub: 0,
})
ok(goodStr.ok && goodStr.profile.on_plan === false, 'validate on_plan string false')

// --- payroll: разные исходы ---
const matrix = [
  { trainer_id: 'tr1', membership_type_id: 'vip', count: 2 },
  { trainer_id: 'tr2', membership_type_id: 'vip', count: 2 },
]
const pay = computePayrollFromMatrixRows(matrix, null, {
  membershipTypes: types,
  planConfig: plan,
  profilesByTrainerId: new Map([
    ['tr1', { trainer_id: 'tr1', on_plan: false, rate_adjustment_rub: 100 }],
    ['tr2', { trainer_id: 'tr2', on_plan: true, rate_adjustment_rub: -200 }],
  ]),
})
// tr1: no plan → L3 500+100=600 ×2 = 1200
// tr2: 2 workouts → L1 200-200=0 ×2 = 0
ok(pay.byTrainer.get('tr1')?.total === 1200, 'payroll no-plan + adj')
ok(pay.byTrainer.get('tr2')?.total === 0, 'payroll L1 with -200 floors to 0')
ok(pay.clubTotal === 1200, 'club total ignores zeroed trainer pay')

const monthPay = aggregatePayrollFromDailyRows(
  [
    { trainings_matrix: [{ trainer_id: 'tr3', membership_type_id: 'vip', count: 90 }] },
    { trainings_matrix: [{ trainer_id: 'tr3', membership_type_id: 'vip', count: 20 }] },
  ],
  null,
  {
    membershipTypes: types,
    planConfig: plan,
    profilesByTrainerId: { tr3: { on_plan: true, rate_adjustment_rub: 0 } },
  },
)
// 110 workouts → L2 → 350 × 110
ok(monthPay.clubTotal === 350 * 110, 'month tier from total workouts')

// Смесь типов: уровень от суммы тренировок, ставки разные
const mix = computePayrollFromMatrixRows(
  [
    { trainer_id: 'tr4', membership_type_id: 'vip', count: 50 },
    { trainer_id: 'tr4', membership_type_id: 'std', count: 40 },
  ],
  null,
  {
    membershipTypes: types,
    planConfig: plan,
    profilesByTrainerId: { tr4: { on_plan: true, rate_adjustment_rub: 0 } },
  },
)
// 90 workouts → L2; VIP 350×50 + STD 150×40 = 17500 + 6000 = 23500
ok(mix.byTrainer.get('tr4')?.total === 23500, 'multi-type L2 mix')

// Без кабинета → с планом, adj 0; 5 тренировок → L1
const noProf = computePayrollFromMatrixRows(
  [{ trainer_id: 'tr5', membership_type_id: 'vip', count: 5 }],
  null,
  { membershipTypes: types, planConfig: plan },
)
ok(noProf.byTrainer.get('tr5')?.total === 200 * 5, 'missing profile → L1 default')

// Неизвестный тип — не платим
const unk = computePayrollFromMatrixRows(
  [{ trainer_id: 'tr6', membership_type_id: 'ghost', count: 10 }],
  null,
  {
    membershipTypes: types,
    planConfig: plan,
    profilesByTrainerId: { tr6: { on_plan: false, rate_adjustment_rub: 999 } },
  },
)
ok(unk.clubTotal === 0 && !unk.byTrainer.has('tr6'), 'unknown type skipped')

// Без membershipTypes — legacy rateMap (только L1/session)
const legacyMap = new Map([['vip', 200]])
const legacyPay = computePayrollFromMatrixRows(
  [{ trainer_id: 'tr7', membership_type_id: 'vip', count: 3 }],
  legacyMap,
  {},
)
ok(legacyPay.clubTotal === 600, 'legacy rateMap without tiers opts')

// Фильтр тренера (self-stats): чужие строки не в total, но workouts тренера из его строк
const filtered = computePayrollFromMatrixRows(
  [
    { trainer_id: 'me', membership_type_id: 'vip', count: 100 },
    { trainer_id: 'other', membership_type_id: 'vip', count: 100 },
  ],
  null,
  {
    membershipTypes: types,
    planConfig: plan,
    trainerIdFilter: 'me',
    profilesByTrainerId: {
      me: { on_plan: true, rate_adjustment_rub: 0 },
      other: { on_plan: true, rate_adjustment_rub: 0 },
    },
  },
)
// me: 100 → L2 → 350×100; other excluded
ok(filtered.clubTotal === 35000 && filtered.byTrainer.size === 1, 'trainerIdFilter self-stats')

// Пустая матрица
const empty = computePayrollFromMatrixRows([], null, { membershipTypes: types, planConfig: plan })
ok(empty.clubTotal === 0 && empty.byTrainer.size === 0, 'empty matrix')

// Карта с оплатой 0 + adj не даёт денег
const free = {
  id: 'free',
  trainer_pay_l1: 0,
  trainer_pay_l2: 0,
  trainer_pay_l3: 0,
  trainer_pay_per_session: 0,
}
const zeroCard = computePayrollFromMatrixRows(
  [
    { trainer_id: 'tr9', membership_type_id: 'free', count: 10 },
    { trainer_id: 'tr9', membership_type_id: 'vip', count: 2 },
  ],
  null,
  {
    membershipTypes: [...types, free],
    planConfig: plan,
    profilesByTrainerId: { tr9: { on_plan: false, rate_adjustment_rub: 100 } },
  },
)
// free: 0×10; VIP L3 500+100=600×2 = 1200
ok(zeroCard.clubTotal === 1200, 'zero-pay type not boosted by adj')

// Карты с оплатой 0 не двигают пороги плана (только оплачиваемые)
const planOnlyPaid = computePayrollFromMatrixRows(
  [
    { trainer_id: 'tr10', membership_type_id: 'free', count: 100 },
    { trainer_id: 'tr10', membership_type_id: 'vip', count: 79 },
  ],
  null,
  {
    membershipTypes: [...types, free],
    planConfig: plan,
    profilesByTrainerId: { tr10: { on_plan: true, rate_adjustment_rub: 0 } },
  },
)
// 100 free ignored → 79 paid → L1 → 200×79 = 15800 (не L3 от 179)
ok(planOnlyPaid.clubTotal === 15800, 'zero-pay workouts excluded from plan tier')
ok(planOnlyPaid.byTrainer.get('tr10')?.byType.find((x) => x.typeId === 'free')?.count === 100, 'zero-pay still listed at 0₽')

const planCrossesL2 = computePayrollFromMatrixRows(
  [
    { trainer_id: 'tr11', membership_type_id: 'free', count: 50 },
    { trainer_id: 'tr11', membership_type_id: 'vip', count: 80 },
  ],
  null,
  {
    membershipTypes: [...types, free],
    planConfig: plan,
    profilesByTrainerId: { tr11: { on_plan: true, rate_adjustment_rub: 0 } },
  },
)
// 80 paid → L2 → 350×80; free 50 at 0
ok(planCrossesL2.clubTotal === 28000, 'paid-only count reaches L2 without free inflate')

// Без плана при огромном объёме + надбавка на двух типах
const offPlan = aggregatePayrollFromDailyRows(
  [
    {
      trainings_matrix: [
        { trainer_id: 'tr8', membership_type_id: 'vip', count: 10 },
        { trainer_id: 'tr8', membership_type_id: 'std', count: 5 },
      ],
    },
  ],
  null,
  {
    membershipTypes: types,
    planConfig: plan,
    profilesByTrainerId: { tr8: { on_plan: false, rate_adjustment_rub: 50 } },
  },
)
// L3 всегда: (500+50)×10 + (200+50)×5 = 5500 + 1250 = 6750
ok(offPlan.clubTotal === 6750, 'off-plan L3 + adj on two types')

ok(getTrainerPayProfile(null, 'x', 'c').on_plan === true, 'missing profile defaults')
ok(getTrainerPayProfile(new Map(), 'x', 'c').rate_adjustment_rub === 0, 'empty map defaults adj 0')

if (failed > 0) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer pay profile checks passed')
