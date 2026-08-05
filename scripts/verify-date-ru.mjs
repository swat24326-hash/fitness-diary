/**
 * node scripts/verify-date-ru.mjs
 * Календарный месяц для срока абонемента + маска/разбор дат.
 */
import {
  addDaysToIso,
  addMonthsToIso,
  birthDateYearBounds,
  defaultMembershipEndIso,
  maskRuDateDigitsInput,
  parseFlexibleDateToIso,
} from '../src/lib/dateRu.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(addDaysToIso('2026-07-25', 30) === '2026-08-24', 'legacy +30 days (contrast)')
ok(addMonthsToIso('2026-07-24', 1) === '2026-08-24', '24 → 24 next month')
ok(addMonthsToIso('2026-07-25', 1) === '2026-08-25', '25 → 25 next month')
ok(defaultMembershipEndIso('2026-07-25') === '2026-08-25', 'default end = +1 calendar month')
ok(addMonthsToIso('2026-01-31', 1) === '2026-02-28', 'Jan 31 → Feb 28 (clamp)')
ok(addMonthsToIso('2024-01-31', 1) === '2024-02-29', 'Jan 31 leap → Feb 29')
ok(addMonthsToIso('2026-12-15', 1) === '2027-01-15', 'Dec → Jan next year')
ok(defaultMembershipEndIso('') === '', 'empty start → empty end')

ok(maskRuDateDigitsInput('01031999') === '01.03.1999', 'mask 8 digits')
ok(maskRuDateDigitsInput('0103') === '01.03', 'mask 4 digits')
ok(maskRuDateDigitsInput('01') === '01', 'mask 2 digits')
ok(maskRuDateDigitsInput('01.03.1999') === '01.03.1999', 'mask keeps digits')
ok(parseFlexibleDateToIso('01031999') === '1999-03-01', 'parse compact digits')
ok(parseFlexibleDateToIso('01.03.1999') === '1999-03-01', 'parse ru birth 1999')
ok(parseFlexibleDateToIso('15.05.1985') === '1985-05-15', 'parse birth before 1990')
ok(parseFlexibleDateToIso('15.05.1985', { minYear: 1990 }) === '', 'membership minYear rejects 1985')
ok(parseFlexibleDateToIso('32.01.1999') === '', 'reject invalid day')
const birthBounds = birthDateYearBounds()
ok(birthBounds.minYear === 1920, 'birth min year')
ok(birthBounds.maxYear >= 2026, 'birth max year')
ok(parseFlexibleDateToIso('01.01.2110', birthBounds) === '', 'birth rejects far future')

if (failed) process.exit(1)
console.log('verify-date-ru: all ok')
