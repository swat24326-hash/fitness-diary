import {
  isPlanMatrixDkFieldKey,
  PLAN_DK_EDIT_WARN_RU,
} from '../src/lib/admin/salesPlanDkEditWarnCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isPlanMatrixDkFieldKey('plan_pz_dk_count'), 'pz dk count')
ok(isPlanMatrixDkFieldKey('plan_az_dk_avg'), 'az dk avg')
ok(!isPlanMatrixDkFieldKey('plan_pz_nk_count'), 'nk is not dk')
ok(!isPlanMatrixDkFieldKey('plan_tz_uk_avg'), 'uk is not dk')
ok(!isPlanMatrixDkFieldKey('plan_extra'), 'extra is not dk')
ok(PLAN_DK_EDIT_WARN_RU.includes('списки'), 'warn mentions lists')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales-plan-dk-edit-warn checks passed')
