import {
  averageLastPaidPurchases,
  applyHallRenewalsSuggestToPlanForm,
  buildHallRenewalsSuggest,
  clampPurchaseHistoryDepth,
  collectHallRenewalCandidates,
  membershipEndsInPlanMonth,
  findRenewalSuccessorMembership,
  membershipHasAlreadyPurchasedSuccessor,
  parsePaidAmountRub,
  refineHallRenewalCell,
  resolveClientRenewalHall,
  sumFactDkCountFromDailyRows,
} from '../src/lib/admin/salesPlanHallRenewalsSuggestCore.js'
import {
  medianPositiveRub,
  resolveAzPackagePriceRub,
  resolvePriceListCheckRub,
  resolvePzCatalogMedianPriceRub,
  resolveTzPackagePriceRub,
} from '../src/lib/admin/salesPlanHallRenewalsPriceCore.js'
import { emptyAzPriceListDocument, setAzPriceListCell } from '../src/lib/priceList/azPriceListCore.js'
import { planMatrixAvgField, planMatrixCountField } from '../src/lib/admin/salesPlanMatrixCore.js'
import { emptyPriceListDocument, setPriceListCell } from '../src/lib/priceList/priceListCore.js'
import { emptyTzPriceListDocument } from '../src/lib/priceList/tzPriceListCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(clampPurchaseHistoryDepth(3) === 3, 'depth 3')
ok(clampPurchaseHistoryDepth(0) === 1, 'depth min')
ok(clampPurchaseHistoryDepth(99) === 12, 'depth max')
ok(clampPurchaseHistoryDepth('x') === 3, 'depth bad → 3')

ok(membershipEndsInPlanMonth('2026-08-15', 2026, 8), 'ends in August')
ok(!membershipEndsInPlanMonth('2026-07-31', 2026, 8), 'July not August')
ok(parsePaidAmountRub('12 500') === 12500, 'parse paid')
ok(parsePaidAmountRub(0) == null, 'zero paid null')

ok(resolveClientRenewalHall({ id: '1', trainer_id: 't1' }) === 'pz', 'pz hall')
ok(resolveClientRenewalHall({ id: '2', desk_hall: 'tz' }) === 'tz', 'tz hall')
ok(resolveClientRenewalHall({ id: '3', desk_hall: 'az' }) === 'az', 'az hall')
ok(resolveClientRenewalHall({ id: '4', archived_at: '2026-01-01', trainer_id: 't' }) == null, 'archive out')

const avg3 = averageLastPaidPurchases(
  [
    { paid_amount: 1000, end_date: '2026-01-01' },
    { paid_amount: 2000, end_date: '2026-03-01' },
    { paid_amount: 3000, end_date: '2026-06-01' },
    { paid_amount: 4000, end_date: '2026-08-01' },
  ],
  3,
)
ok(avg3.sampleCount === 3 && avg3.avgRub === 3000, 'avg of last 3 = 3000')

const avg1 = averageLastPaidPurchases([{ paid_amount: 9000, end_date: '2026-08-01' }], 3)
ok(avg1.sampleCount === 1 && avg1.avgRub === 9000, 'fewer than 3 → last only')

const clients = [
  { id: 'pz1', trainer_id: 'tr1' },
  { id: 'tz1', desk_hall: 'tz' },
  { id: 'az1', desk_hall: 'az' },
  { id: 'noprice', trainer_id: 'tr1' },
]
const memberships = [
  { client_id: 'pz1', end_date: '2026-08-10', paid_amount: 10000, start_date: '2026-05-10' },
  { client_id: 'pz1', end_date: '2026-05-09', paid_amount: 8000, start_date: '2026-02-09' },
  { client_id: 'tz1', end_date: '2026-08-20', paid_amount: 5000, start_date: '2026-02-20' },
  { client_id: 'az1', end_date: '2026-08-05', paid_amount: 7000, start_date: '2026-05-05' },
  { client_id: 'noprice', end_date: '2026-08-01', start_date: '2026-05-01' },
]

const collected = collectHallRenewalCandidates({
  clients,
  memberships,
  year: 2026,
  month: 8,
  historyDepth: 3,
})
ok(collected.candidates.length === 3, '3 candidates with history')
ok(collected.endingWithoutPrice === 1, '1 without history/price')
ok(collected.fromHistory === 3, 'from history count')
const pzCand = collected.candidates.find((c) => c.hall === 'pz')
ok(pzCand && pzCand.avgRub === 9000 && pzCand.source === 'history', 'pz avg of 2 purchases')

// Старый кончается 10.08, новый уже куплен (старт 10.08 → конец 10.09) — не в продлениях августа
const oldEnd = { id: 'm-old', end_date: '2026-08-10', start_date: '2026-05-10', paid_amount: 8000 }
const nextBought = {
  id: 'm-new',
  end_date: '2026-09-10',
  start_date: '2026-08-10',
  paid_amount: 9000,
}
ok(
  membershipHasAlreadyPurchasedSuccessor([oldEnd, nextBought], oldEnd),
  'successor starts on old end day',
)
const already = collectHallRenewalCandidates({
  clients: [{ id: 'early', trainer_id: 'tr1' }],
  memberships: [
    { ...oldEnd, client_id: 'early' },
    { ...nextBought, client_id: 'early' },
  ],
  year: 2026,
  month: 8,
})
ok(already.candidates.length === 0, 'already bought next → not August DK candidate')
ok(already.endingAlreadyPurchased === 1, 'counted as already purchased')
ok(already.confirmedClosings?.length === 1, 'confirmedClosings has row')
ok(already.confirmedClosings[0].factAmount === 9000, 'factAmount from successor paid')
ok(already.confirmedClosings[0].avgRub === 8000, 'orient avg excludes successor paid')
ok(
  findRenewalSuccessorMembership([oldEnd, nextBought], oldEnd)?.id === 'm-new',
  'findSuccessor returns new membership',
)

const alreadySuggest = buildHallRenewalsSuggest({
  clients: [{ id: 'early', trainer_id: 'tr1' }],
  memberships: [
    { ...oldEnd, client_id: 'early' },
    { ...nextBought, client_id: 'early' },
  ],
  year: 2026,
  month: 8,
  horizon: 'next',
  renewalPct: 80,
})
ok(alreadySuggest.ok === true, 'only confirmed → suggest ok for playbook')
ok(alreadySuggest.count === 0, 'only confirmed → DK count 0')
ok(alreadySuggest.confirmedClosings?.length === 1, 'suggest keeps confirmedClosings')

const tzDoc = emptyTzPriceListDocument({
  month1_rows: [{ months: 6, base_stand: 4500, base_full: 5000 }],
})
ok(resolveTzPackagePriceRub(tzDoc, 6) === 4500, 'tz stand price')
ok(
  resolvePriceListCheckRub({
    hall: 'tz',
    membership: { start_date: '2026-08-17', end_date: '2026-08-17' },
    tzPriceListDoc: tzDoc,
  }) === 750,
  'tz 1-day uses one_time not month package',
)
ok(
  resolvePriceListCheckRub({
    hall: 'tz',
    membership: { start_date: '2026-08-17', end_date: '2026-08-23' },
    tzPriceListDoc: tzDoc,
  }) == null,
  'tz 7-day does not fake 1 month price',
)

let pzDoc = emptyPriceListDocument({ club_id: 'c1' })
pzDoc = setPriceListCell(pzDoc, {
  sessions: 8,
  people: 1,
  membershipTypeId: 'type-pz',
  mode: 'base',
  price_10: 12000,
  price_full: 14000,
})
const priceFallback = resolvePriceListCheckRub({
  hall: 'pz',
  membership: { membership_type_id: 'type-pz' },
  pzPriceListDoc: pzDoc,
})
ok(priceFallback === 12000, 'pz price list fallback')

const withFallback = collectHallRenewalCandidates({
  clients: [{ id: 'noprice', trainer_id: 'tr1' }],
  memberships: [
    {
      client_id: 'noprice',
      end_date: '2026-08-01',
      start_date: '2026-05-01',
      membership_type_id: 'type-pz',
    },
  ],
  year: 2026,
  month: 8,
  historyDepth: 3,
  pzPriceListDoc: pzDoc,
})
ok(withFallback.candidates.length === 1, 'fallback candidate')
ok(withFallback.candidates[0].source === 'price_list', 'source price_list')
ok(withFallback.candidates[0].avgRub === 12000, 'fallback rub')
ok(withFallback.fromPriceList === 1, 'fromPriceList count')

const refined = refineHallRenewalCell({
  rawCount: 10,
  sumAvgRub: 100000,
  renewalPct: 80,
  factCount: 2,
  horizon: 'current',
})
ok(refined.afterRate === 8 && refined.count === 8, '80% · факт из отчёта не вычитаем')
ok(refined.factCount === 0, 'factCount ignored in strategy')
ok(refined.poolAvg === 10000, 'pool avg')
ok(refined.expectedAmount === 80000, 'expected ₽ = sum × %')
ok(refined.amount === 80000, 'amount = expected (no fact cut)')

ok(medianPositiveRub([1, 2, 100]) === 2, 'median')
ok(resolvePzCatalogMedianPriceRub(pzDoc) === 12000, 'pz catalog median')

let azDoc = emptyAzPriceListDocument()
azDoc = setAzPriceListCell(azDoc, {
  sessions: 12,
  directionId: 'dir-box',
  price_10: 3600,
  price_full: 4000,
})
ok(
  resolveAzPackagePriceRub(azDoc, { sessions: 0, directionId: 'dir-box' }) === 3600,
  'az without sessions → mid/only cell',
)
ok(
  resolveAzPackagePriceRub(azDoc, { sessions: 8, directionId: 'dir-box' }) === 3600,
  'az nearest sessions',
)
ok(resolveTzPackagePriceRub(tzDoc, 5) === 4500, 'tz nearest months')

ok(sumFactDkCountFromDailyRows([{ tz_dk: 2 }, { tz_dk: 1 }], 'tz_dk') === 3, 'fact tz')

const suggest = buildHallRenewalsSuggest({
  clients,
  memberships,
  year: 2026,
  month: 8,
  horizon: 'next',
  renewalPct: 100,
  historyDepth: 3,
  factByHall: { pz: 0, tz: 0, az: 0 },
})
ok(suggest.ok, 'suggest ok')
ok(suggest.byHall.pz.count === 1, 'pz count 100%')
ok(suggest.byHall.tz.count === 1, 'tz count')
ok(suggest.byHall.az.count === 1, 'az count')

const form = applyHallRenewalsSuggestToPlanForm({}, suggest)
ok(form[planMatrixCountField('pz_dk')] === '1', 'form pz count')
ok(Number(form[planMatrixAvgField('tz_dk')]) === 5000, 'form tz avg')

if (failed) {
  console.error(`\n${failed} hall renewals check(s) failed`)
  process.exit(1)
}
console.log('\nAll sales plan hall renewals checks passed')
