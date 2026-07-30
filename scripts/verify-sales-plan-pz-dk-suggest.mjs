import {
  applyPzDkSuggestToPlanForm,
  asOfIsoBeforePlanMonth,
  buildPzDkByTypeAfterRenewal,
  buildPzDkPlanSuggest,
  buildPzDkSuggestFromHeadcounts,
  clampRenewalPct,
  countUsablePzClientsByType,
  formatPzDkSuggestSummaryRu,
  lastDayIsoOfMonth,
  normalizePzDkSuggestHorizon,
  planMonthMatchesTarget,
  PZ_DK_DEFAULT_RENEWAL_PCT,
  PZ_DK_SUGGEST_CELL_KEY,
  PZ_DK_SUGGEST_SESSIONS,
  refinePzDkSuggestForPlan,
  resolvePackagePriceRub,
  resolvePzDkSuggestAsOfIso,
  resolveTargetPlanMonthForHorizon,
  scalePzDkByTypeToTotal,
  sumFactPzDkCountFromDailyRows,
} from '../src/lib/admin/salesPlanPzDkSuggestCore.js'
import {
  emptyPriceListDocument,
  setPriceListCell,
  syncTariffsFromMembershipTypes,
} from '../src/lib/priceList/priceListCore.js'
import { planMatrixAvgField, planMatrixCountField } from '../src/lib/admin/salesPlanMatrixCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(asOfIsoBeforePlanMonth(2026, 8) === '2026-07-31', 'asOf before August = Jul 31')
ok(asOfIsoBeforePlanMonth(2026, 1) === '2025-12-31', 'asOf before January = Dec 31')
ok(asOfIsoBeforePlanMonth(2026, 0) == null, 'bad month → null')

ok(normalizePzDkSuggestHorizon('current') === 'current', 'horizon current')
ok(normalizePzDkSuggestHorizon('next') === 'next', 'horizon next')
ok(normalizePzDkSuggestHorizon('nope') == null, 'horizon bad')
ok(lastDayIsoOfMonth(2026, 2) === '2026-02-28', 'last day Feb 2026')

const cur = resolvePzDkSuggestAsOfIso({
  horizon: 'current',
  year: 2026,
  month: 7,
  todayIso: '2026-07-15',
})
ok(cur.ok && cur.asOfIso === '2026-07-15', 'current → today')

const curPast = resolvePzDkSuggestAsOfIso({
  horizon: 'current',
  year: 2026,
  month: 6,
  todayIso: '2026-07-15',
})
ok(curPast.ok && curPast.asOfIso === '2026-06-30', 'current past month → last day of plan month')

const nxt = resolvePzDkSuggestAsOfIso({
  horizon: 'next',
  year: 2026,
  month: 8,
  todayIso: '2026-07-15',
})
ok(nxt.ok && nxt.asOfIso === '2026-07-31', 'next → day before plan month')

ok(clampRenewalPct(80) === 80, 'renewal 80')
ok(clampRenewalPct(0) === 1, 'renewal min 1')
ok(clampRenewalPct(150) === 100, 'renewal max 100')
ok(clampRenewalPct('x') === PZ_DK_DEFAULT_RENEWAL_PCT, 'renewal bad → default')

const tgtCur = resolveTargetPlanMonthForHorizon('current', '2026-07-15')
ok(tgtCur?.year === 2026 && tgtCur?.month === 7, 'target current = Jul')
const tgtNext = resolveTargetPlanMonthForHorizon('next', '2026-07-15')
ok(tgtNext?.year === 2026 && tgtNext?.month === 8, 'target next = Aug')
ok(planMonthMatchesTarget(2026, 8, tgtNext), 'month matches target')
ok(!planMonthMatchesTarget(2026, 7, tgtNext), 'month mismatch')

ok(sumFactPzDkCountFromDailyRows([{ pz_dk: 2 }, { pz_dk: '3' }, {}]) === 5, 'fact pz_dk sum')

ok(resolvePackagePriceRub({ price_10: 9000, price_full: 10000 }) === 9000, 'prefer stand −10%')
ok(resolvePackagePriceRub({ price_full: 10000 }) === 10000, 'fallback full')
ok(resolvePackagePriceRub({ price_10: 0, price_full: 0 }) == null, 'zero → null')

const typePl = { id: 't-pl', code: 'PL', is_active: true, trainer_assignable: true }
const typeVip = { id: 't-vip', code: 'VIP', is_active: true, trainer_assignable: true }
const types = [typePl, typeVip]

let doc = emptyPriceListDocument({ club_id: 'club-1' })
doc = syncTariffsFromMembershipTypes(doc, types)
doc = setPriceListCell(doc, {
  sessions: 8,
  people: 1,
  membershipTypeId: 't-pl',
  mode: 'base',
  price_full: 10000,
})
doc = setPriceListCell(doc, {
  sessions: 8,
  people: 1,
  membershipTypeId: 't-vip',
  mode: 'base',
  price_full: 20000,
})

const memberships = [
  {
    client_id: 'c1',
    membership_type_id: 't-pl',
    start_date: '2026-07-01',
    end_date: '2026-08-31',
    total_trainings: 8,
    used_trainings: 2,
  },
  {
    client_id: 'c2',
    membership_type_id: 't-pl',
    start_date: '2026-07-01',
    end_date: '2026-08-31',
    total_trainings: 8,
    used_trainings: 0,
  },
  {
    client_id: 'c3',
    membership_type_id: 't-vip',
    start_date: '2026-07-01',
    end_date: '2026-08-31',
    total_trainings: 8,
    used_trainings: 1,
  },
  {
    client_id: 'c4',
    membership_type_id: 't-pl',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    total_trainings: 8,
    used_trainings: 0,
  },
]

const clients = [
  { id: 'c1' },
  { id: 'c2' },
  { id: 'c3' },
  { id: 'c4' },
  { id: 'c5', archived_at: '2026-01-01' },
]

const headcounts = countUsablePzClientsByType({
  memberships,
  clients,
  catalogTypeIds: ['t-pl', 't-vip'],
  asOfIso: '2026-07-31',
})
ok(headcounts.get('t-pl') === 2, '2 usable PL on Jul 31')
ok(headcounts.get('t-vip') === 1, '1 usable VIP')
ok(!headcounts.has('missing'), 'no extra keys')

const suggest = buildPzDkPlanSuggest({
  priceListDoc: doc,
  membershipTypes: types,
  memberships,
  clients,
  asOfIso: '2026-07-31',
})
ok(suggest.ok === true, 'suggest ok')
ok(suggest.cellKey === PZ_DK_SUGGEST_CELL_KEY, 'cell pz_dk')
ok(suggest.sessions === PZ_DK_SUGGEST_SESSIONS, 'sessions 8')
ok(suggest.count === 3, 'count = 2 PL + 1 VIP')
// weighted: (2*9000 + 1*18000) / 3 = 12000
ok(suggest.avg_check === 12000, `weighted avg 12000 (got ${suggest.avg_check})`)
ok(suggest.amount === 36000, `amount 36000 (got ${suggest.amount})`)

const refinedNext = refinePzDkSuggestForPlan(suggest, { renewalPct: 80, horizon: 'next' })
ok(refinedNext.ok && refinedNext.count === 3, `next 80% per-type sum (got ${refinedNext.count})`)
ok(refinedNext.byTypePlan?.length === 2, 'byTypePlan has 2 cards')
ok(refinedNext.byTypePlan.some((r) => r.code === 'PL' && r.baseCount === 2 && r.planCount === 2), 'PL after 80%')
ok(refinedNext.byTypePlan.some((r) => r.code === 'VIP' && r.planCount === 1), 'VIP after 80%')
ok(refinedNext.rawCount === 3 && refinedNext.renewalPct === 80, 'raw + pct kept')

const refinedCur = refinePzDkSuggestForPlan(suggest, {
  renewalPct: 100,
  horizon: 'current',
  factPzDkCount: 1,
})
ok(refinedCur.ok && refinedCur.count === 2, 'current 100% − fact 1 → 2')
ok(
  refinedCur.byTypePlan.reduce((a, r) => a + r.planCount, 0) === 2,
  'byTypePlan sums to plan count after fact',
)

const refinedZero = refinePzDkSuggestForPlan(suggest, {
  renewalPct: 100,
  horizon: 'current',
  factPzDkCount: 10,
})
ok(refinedZero.ok === false, 'fact covers all → fail')

const scaled = scalePzDkByTypeToTotal(
  [
    { code: 'A', baseCount: 10, planCount: 10, priceRub: 1000, amount: 10000, membershipTypeId: 'a' },
    { code: 'B', baseCount: 5, planCount: 5, priceRub: 2000, amount: 10000, membershipTypeId: 'b' },
  ],
  9,
)
ok(scaled.reduce((a, r) => a + r.planCount, 0) === 9, 'scale to 9')
ok(buildPzDkByTypeAfterRenewal([{ code: 'X', count: 10, priceRub: 1000, membershipTypeId: 'x' }], 50)[0].planCount === 5, '50% of 10')


const form = applyPzDkSuggestToPlanForm(
  { plan_level_3: '100000', plan_pz_nk_count: '5', plan_pz_nk_avg: '1000' },
  suggest,
)
ok(form[planMatrixCountField('pz_dk')] === '3', 'form count field')
ok(form[planMatrixAvgField('pz_dk')] === '12000', 'form avg field')
ok(form.plan_pz_nk_count === '5', 'other cells preserved')

const summary = formatPzDkSuggestSummaryRu(suggest)
ok(summary.includes('3 шт.'), 'summary has count')
ok(summary.includes('пакет 8 тр.'), 'summary has package')

const emptySuggest = buildPzDkSuggestFromHeadcounts({
  priceListDoc: emptyPriceListDocument(),
  membershipTypes: types,
  headcountsByTypeId: new Map(),
})
ok(emptySuggest.ok === false, 'empty headcount fails')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
