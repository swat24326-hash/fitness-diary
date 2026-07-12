import {
  BMI_BAR_GRID_COLUMNS,
  bmiToBarPercent,
  calcBmiFromHeightWeight,
  getBmiMeta,
} from '../src/lib/bmiScaleCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(calcBmiFromHeightWeight(187, 89) === 25.5, 'bmi calc')
ok(getBmiMeta(17)?.key === 'under', 'deficit zone')
ok(getBmiMeta(22)?.key === 'normal', 'normal zone')
ok(getBmiMeta(27)?.key === 'over', 'over zone')
ok(getBmiMeta(32)?.key === 'obese', 'obese zone')
ok(getBmiMeta(27)?.color === '#f97316', 'over color orange')
ok(getBmiMeta(32)?.color === '#ef4444', 'obese color red')

ok(BMI_BAR_GRID_COLUMNS === '4.5fr 6.5fr 5fr 10fr', 'bar columns aligned to 14-40 scale')
ok(Math.round(bmiToBarPercent(25.5)) === 44, 'marker in over zone on scale')
ok(Math.round(bmiToBarPercent(18.5)) === 17, 'tick 18.5 at deficit/normal boundary')
ok(Math.round(bmiToBarPercent(25)) === 42, 'tick 25 at normal/over boundary')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll BMI scale checks passed.')
