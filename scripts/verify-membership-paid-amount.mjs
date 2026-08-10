/**
 * node scripts/verify-membership-paid-amount.mjs
 */
import {
  formatMembershipPaidAmountCell,
  paidAmountFromMembershipForm,
} from '../src/lib/admin/membershipPaidAmountCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(paidAmountFromMembershipForm('') === null, 'empty → null')
ok(paidAmountFromMembershipForm('8800') === 8800, '8800')
ok(paidAmountFromMembershipForm('8 800') === 8800, 'spaces')
ok(paidAmountFromMembershipForm('88,5') === 88.5, 'comma')
ok(paidAmountFromMembershipForm('-1') === null, 'negative')
ok(paidAmountFromMembershipForm('abc') === null, 'junk')
ok(formatMembershipPaidAmountCell(null) === '—', 'null format')
ok(formatMembershipPaidAmountCell(8800) !== '—', 'format number')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll membership paid_amount checks passed')
