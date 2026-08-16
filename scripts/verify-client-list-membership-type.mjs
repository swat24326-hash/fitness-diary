/**
 * node scripts/verify-client-list-membership-type.mjs
 */
import {
  pickMembershipForTypeCodeDisplay,
  resolveClientListMembershipTypeCode,
} from '../src/lib/admin/clientListMembershipTypeCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const types = [
  { id: 't-dm', code: 'Dm' },
  { id: 't-el', code: 'El' },
]

const active = { id: 'm1', membership_type_id: 't-dm', start_date: '2026-01-01', end_date: '2026-12-31' }
ok(
  resolveClientListMembershipTypeCode({ active, memList: [active], todayIso: '2026-08-16' }, types) === 'Dm',
  'active → Dm',
)

const future = {
  id: 'm2',
  membership_type_id: 't-el',
  start_date: '2026-08-17',
  end_date: '2027-02-17',
}
ok(
  pickMembershipForTypeCodeDisplay({
    active: null,
    memList: [future],
    todayIso: '2026-08-16',
  })?.id === 'm2',
  'not_started picks future',
)
ok(
  resolveClientListMembershipTypeCode(
    { active: null, memList: [future], todayIso: '2026-08-16' },
    types,
  ) === 'El',
  'future → El',
)

const expiredLeft = {
  id: 'm3',
  membership_type_id: 't-dm',
  start_date: '2025-01-01',
  end_date: '2026-07-01',
}
ok(
  resolveClientListMembershipTypeCode(
    { active: null, expiredLeft, memList: [expiredLeft, future], todayIso: '2026-08-16' },
    types,
  ) === 'Dm',
  'expiredLeft wins over future',
)

const activeNoType = {
  id: 'm4',
  membership_type_id: '',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
}
ok(
  resolveClientListMembershipTypeCode(
    { active: activeNoType, memList: [activeNoType, future], todayIso: '2026-08-16' },
    types,
  ) === '',
  'active without type must NOT steal future El',
)

ok(
  resolveClientListMembershipTypeCode({ active: null, memList: [], todayIso: '2026-08-16' }, types) === '',
  'empty → no code',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('verify-client-list-membership-type: all passed')
