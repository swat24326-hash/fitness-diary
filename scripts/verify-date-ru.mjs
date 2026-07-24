/**
 * node scripts/verify-date-ru.mjs
 * Календарный месяц для срока абонемента (24→24, не +30 дней).
 */
import { addDaysToIso, addMonthsToIso, defaultMembershipEndIso } from '../src/lib/dateRu.js'

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

if (failed) process.exit(1)
console.log('verify-date-ru: all ok')
