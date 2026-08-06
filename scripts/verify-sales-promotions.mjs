import {
  activePromotionsOnDate,
  buildPromotionsComparison,
  buildPromoSegmentKeysFromAxes,
  emptySalesPromotionDraft,
  hasNonZeroPromoSales,
  normalizePromoSalesFromDb,
  normalizePromotionsFromDb,
  promoAxesFromSegmentKeys,
  promoSalesFormToPayload,
  promoSalesToFormMap,
  resolvePromoSegmentKeysFromDraft,
  salesPromoSegmentsLabel,
  sumPromoFact,
  validateDayPromoSales,
  validatePromotionsForSave,
} from '../src/lib/admin/salesPromotionsCore.js'
import { assertSalesPlanScopeForRole } from '../src/lib/admin/salesAccessCore.js'
import { planFormToPayload } from '../src/lib/admin/salesReportCore.js'
import { buildPlanMatrixComparison } from '../src/lib/admin/salesPlanMatrixCompare.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

console.log('\n— legacy —')
ok(normalizePromotionsFromDb(null).length === 0, 'null promotions → []')
ok(normalizePromotionsFromDb(undefined).length === 0, 'undefined promotions → []')
ok(normalizePromotionsFromDb({}).length === 0, 'object promotions → []')
ok(Object.keys(normalizePromoSalesFromDb(null)).length === 0, 'null promo_sales → {}')
ok(Object.keys(normalizePromoSalesFromDb({})).length === 0, 'empty promo_sales → {}')
ok(!hasNonZeroPromoSales({}), 'empty hasNonZero false')
ok(!hasNonZeroPromoSales({ a: 0 }), 'zero hasNonZero false')

const legacyCompare = buildPromotionsComparison({
  promotions: null,
  monthRows: [{ report_date: '2026-08-01', pz_nk: 2 }],
  todayIso: '2026-08-06',
})
ok(legacyCompare.has_promotions === false && legacyCompare.rows.length === 0, 'legacy compare empty')

const dayOk = validateDayPromoSales({
  promo_sales: {},
  promotions: [],
  matrixCounts: { pz_nk: 0 },
})
ok(dayOk.ok === true, 'legacy day validate skip')

console.log('\n— roles (scope) —')
ok(assertSalesPlanScopeForRole('promotions', false).ok, 'admin promotions ok')
ok(assertSalesPlanScopeForRole('promotions', true).ok, 'manager promotions ok')
ok(assertSalesPlanScopeForRole('levels', false).ok, 'admin levels ok')
ok(!assertSalesPlanScopeForRole('levels', true).ok, 'manager levels blocked')
ok(assertSalesPlanScopeForRole('directions', true).ok, 'manager directions still ok')
ok(assertSalesPlanScopeForRole('all', false).ok, 'admin all ok')
ok(!assertSalesPlanScopeForRole('all', true).ok, 'manager all blocked')

console.log('\n— normalize / validate plan —')
const draft = emptySalesPromotionDraft({ year: 2026, month: 8 })
ok(draft.start_date === '2026-08-01' && draft.end_date === '2026-08-31', 'draft month dates')
draft.name = 'НК −20%'
draft.segment_key = 'pz_nk'
draft.goal_qty = 10

const saved = validatePromotionsForSave([draft])
ok(saved.ok === true && saved.promotions.length === 1, 'validate promotions ok')
ok(saved.promotions[0].goal_qty === 10, 'goal kept')

const bad = validatePromotionsForSave([{ ...draft, end_date: '2026-07-01' }])
ok(bad.ok === false, 'end before start rejected')

const badSeg = validatePromotionsForSave([
  { ...draft, segment_key: 'xx_yy', segment_keys: ['xx_yy'] },
])
ok(badSeg.ok === false, 'bad segment rejected')

const dup = validatePromotionsForSave([draft, { ...draft, name: 'Другая' }])
ok(dup.ok === false, 'duplicate id rejected')

console.log('\n— active on date —')
const promos = saved.promotions
ok(activePromotionsOnDate(promos, '2026-08-15').length === 1, 'active mid month')
ok(activePromotionsOnDate(promos, '2026-09-01').length === 0, 'inactive next month')
ok(activePromotionsOnDate(promos, 'bad').length === 0, 'bad date → none')

console.log('\n— day form / validate —')
const formPayload = promoSalesFormToPayload({ [draft.id]: '3', other: '' })
ok(formPayload.ok && formPayload.promo_sales[draft.id] === 3, 'form to payload')

const formMap = promoSalesToFormMap({ [draft.id]: 3 })
ok(formMap[draft.id] === '3', 'to form map')

const over = validateDayPromoSales({
  promo_sales: { [draft.id]: 5 },
  promotions: promos,
  matrixCounts: { pz_nk: 2 },
})
ok(over.ok === false && /матрице/i.test(over.error || ''), 'over segment blocked')

const fit = validateDayPromoSales({
  promo_sales: { [draft.id]: 2 },
  promotions: promos,
  matrixCounts: { pz_nk: 2 },
})
ok(fit.ok === true, 'fit segment ok')

const orphan = validateDayPromoSales({
  promo_sales: { 'missing-id': 1 },
  promotions: promos,
  matrixCounts: { pz_nk: 5 },
})
ok(orphan.ok === false, 'orphan promo id blocked')

const promoB = {
  ...emptySalesPromotionDraft({ year: 2026, month: 8 }),
  name: 'Вторая',
  segment_key: 'pz_nk',
  goal_qty: 5,
}
const two = validatePromotionsForSave([draft, promoB])
ok(two.ok === true, 'two promos same segment ok')
const sumOver = validateDayPromoSales({
  promo_sales: { [draft.id]: 2, [promoB.id]: 2 },
  promotions: two.promotions,
  matrixCounts: { pz_nk: 3 },
})
ok(sumOver.ok === false, 'sum of two promos > cell blocked')
const sumFit = validateDayPromoSales({
  promo_sales: { [draft.id]: 2, [promoB.id]: 1 },
  promotions: two.promotions,
  matrixCounts: { pz_nk: 3 },
})
ok(sumFit.ok === true, 'sum of two promos = cell ok')

console.log('\n— fact sum / comparison —')
const monthRows = [
  { report_date: '2026-08-01', promo_sales: { [draft.id]: 2 }, pz_nk: 2 },
  { report_date: '2026-08-02', promo_sales: null, pz_nk: 1 },
  { report_date: '2026-08-03', promo_sales: { [draft.id]: 1 }, pz_nk: 1 },
]
ok(sumPromoFact(monthRows, draft.id) === 3, 'sum promo fact')
ok(sumPromoFact(monthRows, 'nope') === 0, 'sum missing promo 0')

const cmp = buildPromotionsComparison({
  promotions: promos,
  monthRows,
  todayIso: '2026-08-06',
})
ok(cmp.has_promotions === true && cmp.rows.length === 1, 'compare has row')
ok(cmp.rows[0].sold_qty === 3 && cmp.rows[0].goal_qty === 10, 'compare sold/goal')
ok(cmp.rows[0].remaining_qty === 7, 'compare remaining')
ok(cmp.rows[0].active_now === true, 'active now')
ok(cmp.rows[0].pct_of_goal === 30, 'pct 30')

const ended = validatePromotionsForSave([
  {
    ...draft,
    id: 'ended-promo',
    name: 'Июльская',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    goal_qty: 4,
  },
])
ok(ended.ok, 'ended promo validates')
const histRows = [
  { report_date: '2026-07-10', promo_sales: { 'ended-promo': 4 }, pz_nk: 4 },
  { report_date: '2026-08-01', pz_nk: 1 },
]
const histCmp = buildPromotionsComparison({
  promotions: ended.promotions,
  monthRows: histRows,
  todayIso: '2026-08-06',
})
ok(histCmp.rows[0].sold_qty === 4, 'ended promo still sums historical fact')
ok(histCmp.rows[0].active_now === false, 'ended promo not active now')
ok(activePromotionsOnDate(ended.promotions, '2026-08-06').length === 0, 'ended not in daily UI')

console.log('\n— rationality: promos do not touch plan matrix / levels —')
const levelsPayload = planFormToPayload(
  {
    plan_level_1: '100000',
    plan_level_2: '200000',
    plan_level_3: '300000',
  },
  { scope: 'levels' },
)
ok(levelsPayload.ok === true, 'levels payload ok')
ok(!('promotions' in (levelsPayload.payload || {})), 'levels payload has no promotions')
ok(levelsPayload.payload.plan_level_3 === 300000, 'level 3 unchanged by promo feature')

const matrixCmp = buildPlanMatrixComparison({
  planMatrix: {
    pz_nk: { count: 10, avg_check: 10000 },
  },
  monthRows: [
    { report_date: '2026-08-01', pz_nk: 2, matrix_amounts: { pz_nk: 20000 }, promo_sales: { [draft.id]: 2 } },
  ],
  year: 2026,
  month: 8,
  calendarContext: { month_relation: 'current', expected_plan_progress_pct: 19 },
})
ok(matrixCmp.has_plan_matrix === true, 'segment compare still works with promo_sales on row')
const pzRow = (matrixCmp.rows || []).find((r) => r.cellKey === 'pz_nk')
ok(pzRow && pzRow.fact?.count === 2, 'segment fact from matrix count, not promo')
ok(pzRow && pzRow.promo == null, 'segment row has no promo field (separate block)')

console.log('\n— multi segment one goal (no split) —')
ok(
  resolvePromoSegmentKeysFromDraft({ segment_key: 'tz_nk' }).join() === 'tz_nk',
  'resolve single key',
)
ok(
  resolvePromoSegmentKeysFromDraft({ segment_keys: ['pz_nk', 'pz_dk', 'pz_nk'] }).join() ===
    'pz_nk,pz_dk',
  'resolve uniq keys',
)
ok(
  buildPromoSegmentKeysFromAxes(['pz'], ['nk', 'dk', 'uk']).join() === 'pz_nk,pz_dk,pz_uk',
  'axes → keys',
)
ok(
  salesPromoSegmentsLabel(['pz_nk', 'pz_dk', 'pz_uk']) === 'ПЗ · НК+ДК+УК',
  'compact label one hall',
)
ok(
  salesPromoSegmentsLabel(['pz_nk', 'tz_nk']).includes('ПЗ') &&
    salesPromoSegmentsLabel(['pz_nk', 'tz_nk']).includes('ТЗ'),
  'compact label multi hall',
)
const axes = promoAxesFromSegmentKeys(['pz_nk', 'pz_dk', 'pz_uk'])
ok(axes.hallKeys.join() === 'pz' && axes.colSuffixes.join() === 'nk,dk,uk', 'axes from keys')

const multiSave = validatePromotionsForSave([
  {
    id: 'multi-1',
    name: 'ТЗ год',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    segment_key: 'tz_nk',
    segment_keys: ['tz_nk', 'tz_dk', 'tz_uk'],
    goal_qty: 10,
  },
])
ok(multiSave.ok === true && multiSave.promotions.length === 1, 'validate keeps one promo')
ok(multiSave.promotions[0].goal_qty === 10, 'one shared goal')
ok(multiSave.promotions[0].segment_keys.join() === 'tz_nk,tz_dk,tz_uk', 'keys persisted')
ok(multiSave.promotions[0].id === 'multi-1', 'same id')

const multiPoolOk = validateDayPromoSales({
  promo_sales: { 'multi-1': 5 },
  promotions: multiSave.promotions,
  matrixCounts: { tz_nk: 2, tz_dk: 2, tz_uk: 2 },
})
ok(multiPoolOk.ok === true, 'multi promo ≤ sum of cells')

const multiPoolOver = validateDayPromoSales({
  promo_sales: { 'multi-1': 7 },
  promotions: multiSave.promotions,
  matrixCounts: { tz_nk: 2, tz_dk: 2, tz_uk: 2 },
})
ok(multiPoolOver.ok === false, 'multi promo > sum of cells blocked')

const multiCmp = buildPromotionsComparison({
  promotions: multiSave.promotions,
  monthRows: [{ report_date: '2026-08-01', promo_sales: { 'multi-1': 4 } }],
  todayIso: '2026-08-06',
})
ok(multiCmp.rows.length === 1 && multiCmp.rows[0].sold_qty === 4, 'compare one row shared sold')
ok(multiCmp.rows[0].goal_qty === 10, 'compare shared goal')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales promotions checks passed')
