/**
 * Пороги тренировок плана ЗП тренера.
 * node scripts/verify-trainer-pay-plan.mjs
 */
import {
  defaultTrainerPayPlanConfig,
  describeTrainerPayPlanBands,
  normalizeTrainerPayPlanConfig,
  resolveTrainerPayTierByWorkouts,
  validateTrainerPayPlanConfigForSave,
} from '../src/lib/admin/trainerPayPlanCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const def = defaultTrainerPayPlanConfig()
ok(def.workouts_l2_min === 80 && def.workouts_l3_min === 120, 'default 80 / 120 workouts')

ok(resolveTrainerPayTierByWorkouts(0, def) === 1, '0 → L1')
ok(resolveTrainerPayTierByWorkouts(79, def) === 1, '79 → L1')
ok(resolveTrainerPayTierByWorkouts(80, def) === 2, '80 → L2')
ok(resolveTrainerPayTierByWorkouts(119, def) === 2, '119 → L2')
ok(resolveTrainerPayTierByWorkouts(120, def) === 3, '120 → L3')
ok(resolveTrainerPayTierByWorkouts(200, def) === 3, '200 → L3')

const badOrder = validateTrainerPayPlanConfigForSave({ workouts_l2_min: 100, workouts_l3_min: 100 })
ok(!badOrder.ok, 'l3 must be > l2')

const badFloat = validateTrainerPayPlanConfigForSave({ workouts_l2_min: '60.5', workouts_l3_min: '100' })
ok(!badFloat.ok, 'reject fractional workouts')

const good = validateTrainerPayPlanConfigForSave({ workouts_l2_min: '101', workouts_l3_min: '141' })
ok(good.ok && good.config.workouts_l2_min === 101 && good.config.workouts_l3_min === 141, 'parse integers')

const bands = describeTrainerPayPlanBands(good.config)
ok(bands.l1 === 'от 0 до 100 трен.', 'band L1 integer end')
ok(bands.l2 === 'от 101 до 140 трен.', 'band L2 integer range')
ok(bands.l3 === 'от 141 трен. и выше', 'band L3 from threshold')

const fromLegacyHours = normalizeTrainerPayPlanConfig({ hours_l2_min: 90, hours_l3_min: 130 })
ok(fromLegacyHours.workouts_l2_min === 90 && fromLegacyHours.workouts_l3_min === 130, 'legacy hours_* keys')

const norm = normalizeTrainerPayPlanConfig({ workouts_l2_min: '', workouts_l3_min: null })
ok(norm.workouts_l2_min === 80 && norm.workouts_l3_min === 120, 'empty → defaults')

if (failed > 0) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer pay plan checks passed')
