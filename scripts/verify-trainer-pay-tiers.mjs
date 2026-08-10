/**
 * Три ставки ЗП тренера на типе карты (l1–l3) + совместимость с trainer_pay_per_session.
 */
import {
  membershipTypeCountsTowardPayPlan,
  normalizeTrainerPayTiersInput,
  resolveTrainerPayTiers,
  trainerPayTiersToRowFields,
} from '../src/lib/admin/trainerPayTiersCore.js'
import { normalizeMembershipTypePushPayload } from '../src/lib/admin/membershipTypePushPayload.js'
import { buildTrainerPayRateMap } from '../src/lib/admin/trainerPayrollCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const fromLegacy = resolveTrainerPayTiers({ trainer_pay_per_session: 350 })
ok(fromLegacy.l1 === 350 && fromLegacy.l2 === 350 && fromLegacy.l3 === 350, 'legacy session fills all tiers')

const mixed = resolveTrainerPayTiers({
  trainer_pay_per_session: 200,
  trainer_pay_l1: 200,
  trainer_pay_l2: 350,
  trainer_pay_l3: 500,
})
ok(mixed.l1 === 200 && mixed.l2 === 350 && mixed.l3 === 500, 'explicit tiers win')

const partial = resolveTrainerPayTiers({
  trainer_pay_per_session: 100,
  trainer_pay_l2: 250,
})
ok(partial.l1 === 100 && partial.l2 === 250 && partial.l3 === 250, 'missing l3 falls back to l2')

const bad = normalizeTrainerPayTiersInput({ l1: '-1', l2: '10', l3: '20' })
ok(!bad.ok, 'negative tier rejected')

const good = normalizeTrainerPayTiersInput({ l1: '200', l2: '350', l3: '500' })
ok(good.ok && good.l1 === 200 && good.l2 === 350 && good.l3 === 500, 'normalize three tiers')

const rowFields = trainerPayTiersToRowFields(good)
ok(
  rowFields.trainer_pay_per_session === 200 &&
    rowFields.trainer_pay_l1 === 200 &&
    rowFields.trainer_pay_l2 === 350 &&
    rowFields.trainer_pay_l3 === 500,
  'row fields keep session = l1',
)

const pushLegacy = normalizeMembershipTypePushPayload(
  { id: 't1', club_id: 'c', code: 'VIP', trainer_pay_per_session: 400 },
  { insert: true },
)
ok(
  pushLegacy.ok &&
    pushLegacy.data.trainer_pay_l1 === 400 &&
    pushLegacy.data.trainer_pay_l2 === 400 &&
    pushLegacy.data.trainer_pay_l3 === 400 &&
    pushLegacy.data.trainer_pay_per_session === 400,
  'push legacy session expands to three equal tiers',
)

const pushTiers = normalizeMembershipTypePushPayload(
  {
    id: 't2',
    club_id: 'c',
    code: 'STD',
    trainer_pay_l1: 200,
    trainer_pay_l2: 350,
    trainer_pay_l3: 500,
  },
  { insert: true },
)
ok(
  pushTiers.ok &&
    pushTiers.data.trainer_pay_l1 === 200 &&
    pushTiers.data.trainer_pay_l2 === 350 &&
    pushTiers.data.trainer_pay_l3 === 500 &&
    pushTiers.data.trainer_pay_per_session === 200,
  'push three tiers sets session = l1',
)

const rateMap = buildTrainerPayRateMap([
  {
    id: 't2',
    trainer_pay_per_session: pushTiers.data.trainer_pay_per_session,
    trainer_pay_l1: pushTiers.data.trainer_pay_l1,
    trainer_pay_l2: pushTiers.data.trainer_pay_l2,
    trainer_pay_l3: pushTiers.data.trainer_pay_l3,
  },
])
ok(rateMap.get('t2') === 200, 'current payroll still uses session (= l1)')

ok(
  membershipTypeCountsTowardPayPlan({ trainer_pay_l1: 0, trainer_pay_l2: 0, trainer_pay_l3: 0 }) === false,
  'all-zero type not in plan',
)
ok(
  membershipTypeCountsTowardPayPlan({ trainer_pay_l1: 0, trainer_pay_l2: 100, trainer_pay_l3: 0 }) === true,
  'any positive tier counts toward plan',
)
ok(membershipTypeCountsTowardPayPlan({ trainer_pay_per_session: 200 }) === true, 'legacy paid session in plan')
ok(membershipTypeCountsTowardPayPlan({ trainer_pay_per_session: 0 }) === false, 'legacy zero not in plan')

if (failed > 0) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer pay tiers checks passed')
