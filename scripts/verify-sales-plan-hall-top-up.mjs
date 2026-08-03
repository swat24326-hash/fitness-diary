import {
  allocateNkUkByHallRevenueShare,
  allocatePoolByHallWeights,
  amountToCountAvg,
  applyHallPlanTopUpToPlanForm,
  buildHallPlanTopUpPackage,
  buildPrevMonthHallCategoryStats,
  filterDailyRowsByYearMonth,
  formatHallPlanTopUpSummaryRu,
  hallCountWeights,
  HALL_TOP_UP_BUDGET_TOLERANCE_RUB,
  padPackageUkToBudgetFloor,
  rebalanceHallTargetsToBudget,
  resolveHallPlanTargetsRub,
  splitClubTopUpIntoNkUk,
  STRATEGY_PLAN_EXTRA_FROM_PREV_PCT,
  suggestPlanExtraFromPrevMonthRows,
} from '../src/lib/admin/salesPlanHallTopUpCore.js'
import { planMatrixCountField, planMatrixAvgField } from '../src/lib/admin/salesPlanMatrixCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const mixedRows = [
  {
    report_date: '2026-07-15',
    pz_nk: 1,
    pz_dk: 2,
    pz_uk: 1,
    tz_nk: 1,
    tz_dk: 1,
    tz_uk: 0,
    az_nk: 0,
    az_dk: 1,
    az_uk: 1,
    matrix_amounts: {
      pz_nk: 10000,
      pz_dk: 20000,
      pz_uk: 10000,
      tz_nk: 5000,
      tz_dk: 5000,
      tz_uk: 0,
      az_nk: 0,
      az_dk: 4000,
      az_uk: 4000,
    },
  },
  {
    report_date: '2026-06-01',
    pz_dk: 99,
    matrix_amounts: { pz_dk: 999999 },
  },
]

ok(filterDailyRowsByYearMonth(mixedRows, 2026, 7).length === 1, 'filter by sale month')
const prevRows = filterDailyRowsByYearMonth(mixedRows, 2026, 7)

const stats = buildPrevMonthHallCategoryStats(prevRows)
ok(stats.hasData, 'prev has data')
ok(Math.abs(stats.byHall.pz.cats.dk.share - 0.5) < 0.01, 'pz dk share 50%')

// Пример пользователя: 20 НК ПЗ, 10 ТЗ, 5 АЗ → доли 20/35, 10/35, 5/35
const w = hallCountWeights(
  {
    byHall: {
      pz: { cats: { nk: { count: 20, amount: 1 } } },
      tz: { cats: { nk: { count: 10, amount: 1 } } },
      az: { cats: { nk: { count: 5, amount: 1 } } },
    },
  },
  'nk',
)
ok(w.source === 'prev_count' && Math.abs(w.weights.pz - 20 / 35) < 1e-9, 'nk weights 20:10:5 pz')
ok(Math.abs(w.weights.tz - 10 / 35) < 1e-9, 'nk weights tz')
ok(Math.abs(w.weights.az - 5 / 35) < 1e-9, 'nk weights az')

const split = splitClubTopUpIntoNkUk(350000, {
  byHall: {
    pz: { cats: { nk: { count: 20 }, uk: { count: 10 } } },
    tz: { cats: { nk: { count: 10 }, uk: { count: 5 } } },
    az: { cats: { nk: { count: 5 }, uk: { count: 5 } } },
  },
})
// НК 35 шт, УК 20 шт → НК пул 35/55
ok(Math.abs(split.nkPool - roundNear(350000 * (35 / 55))) < 1, 'club nk/uk pool by counts')
const alloc = allocatePoolByHallWeights(split.nkPool, w.weights)
ok(alloc.pz > alloc.tz && alloc.tz > alloc.az, 'nk money follows 20>10>5')
ok(Math.abs(alloc.pz + alloc.tz + alloc.az - split.nkPool) < 1, 'alloc sums to nk pool')

function roundNear(n) {
  return Math.round(n * 100) / 100
}

const cell = amountToCountAvg(20000, 10000)
ok(cell.count === 2 && cell.avg_check === 10000, 'amount to count/avg')
const rounded = amountToCountAvg(25000, 10000)
ok(rounded.count === 3 && rounded.avg_check === 10000, 'pieces = round(sum / last-month avg)')
ok(rounded.amount === 30000, 'matrix amount = pieces × last-month avg')

const targets = resolveHallPlanTargetsRub(
  { plan_pz: '100000', plan_tz: '20000', plan_az: '10000' },
  stats,
)
ok(targets.source === 'plan_directions' && targets.budget === 130000, 'targets budget')

const reb = rebalanceHallTargetsToBudget(
  { pz: 900700, tz: 203545, az: 95755 },
  { pz: 466244, tz: 202812, az: 149490 },
  1200000,
)
ok(reb.fitted, 'rebalance fitted')
ok(Math.abs(reb.targets.pz + reb.targets.tz + reb.targets.az - 1200000) < 1, 'sum = 1.2M')

const renewals = {
  ok: true,
  count: 3,
  amount: 30000,
  byHall: {
    pz: { count: 2, avg_check: 10000, amount: 20000, rawCount: 3, afterRate: 2, factCount: 0 },
    tz: { count: 1, avg_check: 5000, amount: 5000, rawCount: 1, afterRate: 1, factCount: 0 },
    az: { count: 1, avg_check: 4000, amount: 4000, rawCount: 1, afterRate: 1, factCount: 0 },
  },
}

const pack = buildHallPlanTopUpPackage({
  renewalsSuggest: renewals,
  prevMonthRows: mixedRows,
  prevMonthYear: 2026,
  prevMonthMonth: 7,
  planForm: { plan_pz: '100000', plan_tz: '20000', plan_az: '16000' },
})
ok(pack.ok, 'pack ok')
ok(pack.prevSalesDays === 1, 'used July sales only')
ok(HALL_TOP_UP_BUDGET_TOLERANCE_RUB === 15000, 'tolerance 15k')
ok(pack.fittedToBudget, 'directions pack fitted within tolerance')
ok(pack.totalAmount + 0.01 >= 136000, 'pack not below directions budget 136k')
ok(
  pack.totalAmount - 136000 <= HALL_TOP_UP_BUDGET_TOLERANCE_RUB + 0.01,
  'pack not more than +15k over 136k',
)
// July mixed: доли ₽ залов — ТЗ тоже получает добор
ok(pack.byHall.tz.nk + pack.byHall.tz.uk > 0, 'tz gets top-up by hall revenue share')
ok(pack.nkWeights.source === 'prev_hall_revenue', 'weights from hall revenue')
ok(pack.targets.distribution === 'prev_hall_revenue', 'distribution mode B')

const level3PrevRows = [
  {
    report_date: '2026-07-10',
    pz_nk: 20,
    pz_dk: 20,
    pz_uk: 15,
    tz_nk: 10,
    tz_dk: 5,
    tz_uk: 8,
    az_nk: 5,
    az_dk: 2,
    az_uk: 4,
    matrix_amounts: {
      pz_nk: 200000,
      pz_dk: 400000,
      pz_uk: 150000,
      tz_nk: 100000,
      tz_dk: 100000,
      tz_uk: 80000,
      az_nk: 50000,
      az_dk: 40000,
      az_uk: 40000,
    },
  },
]
const level3Pack = buildHallPlanTopUpPackage({
  renewalsSuggest: {
    ok: true,
    byHall: {
      pz: { count: 58, avg_check: 8040, amount: 466244 },
      tz: { count: 28, avg_check: 7240, amount: 202812 },
      az: { count: 22, avg_check: 6800, amount: 149490 },
    },
  },
  prevMonthRows: level3PrevRows,
  prevMonthYear: 2026,
  prevMonthMonth: 7,
  planForm: { plan_level_3: '1200000' },
})
ok(level3Pack.ok && level3Pack.fittedToBudget, 'level3 fitted')
ok(level3Pack.totalAmount + 0.01 >= 1200000, 'level3 pack not below 1.2M')
ok(
  level3Pack.totalAmount - 1200000 <= HALL_TOP_UP_BUDGET_TOLERANCE_RUB + 0.01,
  'level3 pack not more than +15k over 1.2M',
)
ok(
  formatHallPlanTopUpSummaryRu(level3Pack).includes('не ниже ур. 3'),
  'summary says not below level-3',
)

const padDemo = padPackageUkToBudgetFloor({
  cells: {
    pz_uk: { count: 1, avg_check: 10000, amount: 10000, source: 't' },
    tz_uk: { count: 0, avg_check: 0, amount: 0, source: 't' },
    az_uk: { count: 0, avg_check: 0, amount: 0, source: 't' },
    pz_nk: { count: 0, avg_check: 0, amount: 0 },
    tz_nk: { count: 0, avg_check: 0, amount: 0 },
    az_nk: { count: 0, avg_check: 0, amount: 0 },
  },
  byHall: {
    pz: { nk: 0, dk: 100000, uk: 10000, total: 110000, topUp: 10000 },
    tz: { nk: 0, dk: 0, uk: 0, total: 0, topUp: 0 },
    az: { nk: 0, dk: 0, uk: 0, total: 0, topUp: 0 },
  },
  packTotal: 110000,
  budget: 120000,
  ukWeights: { weights: { pz: 1, tz: 0, az: 0 }, counts: { pz: 1, tz: 0, az: 0 }, total: 1 },
  prev: {
    byHall: {
      pz: { cats: { uk: { avg: 10000, count: 1, amount: 10000 } } },
      tz: { cats: { uk: { avg: 0, count: 0, amount: 0 } } },
      az: { cats: { uk: { avg: 0, count: 0, amount: 0 } } },
    },
  },
})
ok(padDemo.padded && padDemo.packTotal + 0.01 >= 120000, 'pad lifts pack to budget floor')
ok(level3Pack.nkWeights.source === 'prev_hall_revenue', 'level3 hall revenue weights')
// Прошлый месяц: ПЗ 750к > ТЗ 280к > АЗ 130к → добор НК/УК в том же порядке
ok(level3Pack.byHall.pz.topUp > level3Pack.byHall.tz.topUp, 'pz top-up > tz by hall ₽ share')
ok(level3Pack.byHall.tz.topUp > level3Pack.byHall.az.topUp, 'tz top-up > az by hall ₽ share')
ok(level3Pack.byHall.pz.nk > 0 && level3Pack.byHall.tz.nk > 0, 'nk on large halls')
ok(level3Pack.byHall.az.nk > 0 || level3Pack.byHall.az.uk > 0, 'az gets some top-up')
ok(level3Pack.totalAmount < 1253735, 'no old overshoot 1.25M')

const revAlloc = allocateNkUkByHallRevenueShare(100000, stats)
ok(revAlloc.source === 'prev_hall_revenue', 'alloc helper source')
ok(
  Math.abs(revAlloc.byHall.pz.nk + revAlloc.byHall.pz.uk - revAlloc.hallTopUp.pz) < 1,
  'hall top-up = nk+uk',
)
ok(revAlloc.hallTopUp.pz > revAlloc.hallTopUp.tz, 'pz share of remainder > tz')

const form = applyHallPlanTopUpToPlanForm({}, pack, { syncDirections: true })
ok(form[planMatrixCountField('pz_dk')] === '2', 'form pz dk count')
ok(Number(form.plan_pz) === pack.byHall.pz.total, 'form plan_pz = hall cell sum')
ok(form[planMatrixAvgField('pz_nk')], 'form pz nk avg set')
ok(pack.planExtraRub === 0, 'no dop → plan_extra 0')
ok(form.plan_extra === '' || form.plan_extra === '0' || form.plan_extra == null, 'form plan_extra empty')

ok(STRATEGY_PLAN_EXTRA_FROM_PREV_PCT === 70, 'extra pct 70')
const extraHint = suggestPlanExtraFromPrevMonthRows([
  { matrix_amounts: { dop_total: 100000 } },
  { matrix_amounts: { dop_total: 50000 } },
])
ok(extraHint.prevExtraRub === 150000 && extraHint.planExtraRub === 105000, '70% of prev dop')

const withDopRows = [
  {
    report_date: '2026-07-10',
    pz_nk: 20,
    pz_dk: 20,
    pz_uk: 15,
    tz_nk: 10,
    tz_dk: 5,
    tz_uk: 8,
    az_nk: 5,
    az_dk: 2,
    az_uk: 4,
    matrix_amounts: {
      pz_nk: 200000,
      pz_dk: 400000,
      pz_uk: 150000,
      tz_nk: 100000,
      tz_dk: 100000,
      tz_uk: 80000,
      az_nk: 50000,
      az_dk: 40000,
      az_uk: 40000,
      dop_total: 100000,
    },
  },
]
const packWithExtra = buildHallPlanTopUpPackage({
  renewalsSuggest: {
    ok: true,
    byHall: {
      pz: { count: 10, avg_check: 8000, amount: 80000 },
      tz: { count: 5, avg_check: 7000, amount: 35000 },
      az: { count: 5, avg_check: 6000, amount: 30000 },
    },
  },
  prevMonthRows: withDopRows,
  prevMonthYear: 2026,
  prevMonthMonth: 7,
  planForm: { plan_level_3: '1200000' },
})
ok(packWithExtra.ok, 'pack with dop ok')
ok(packWithExtra.planExtraRub === 70000, 'plan_extra = 70% of 100k')
ok(packWithExtra.level3Budget === 1200000, 'level3 kept 1.2M')
ok(packWithExtra.budget === 1130000, 'hall budget = L3 − extra')
ok(packWithExtra.totalAmount + 0.01 >= 1130000, 'halls not below L3−extra')
ok(
  packWithExtra.totalAmount - 1130000 <= HALL_TOP_UP_BUDGET_TOLERANCE_RUB + 0.01,
  'halls within +15k of L3−extra',
)
const formExtra = applyHallPlanTopUpToPlanForm({}, packWithExtra, { syncDirections: true })
ok(formExtra.plan_extra === '70000', 'apply writes plan_extra')

// После «В план» в форме уже направления залов + L3 — повторный расчёт не должен снова вычесть доп.
const afterApplyForm = {
  plan_level_3: '1200000',
  plan_pz: String(packWithExtra.byHall.pz.total),
  plan_tz: String(packWithExtra.byHall.tz.total),
  plan_az: String(packWithExtra.byHall.az.total),
  plan_extra: '70000',
}
const packRecalc = buildHallPlanTopUpPackage({
  renewalsSuggest: {
    ok: true,
    byHall: {
      pz: { count: 10, avg_check: 8000, amount: 80000 },
      tz: { count: 5, avg_check: 7000, amount: 35000 },
      az: { count: 5, avg_check: 6000, amount: 30000 },
    },
  },
  prevMonthRows: withDopRows,
  prevMonthYear: 2026,
  prevMonthMonth: 7,
  planForm: afterApplyForm,
})
ok(packRecalc.ok, 'recalc after apply ok')
ok(packRecalc.level3Budget === 1200000, 'recalc keeps L3 1.2M not directions sum')
ok(packRecalc.budget === 1130000, 'recalc hall budget still L3−extra (no double subtract)')
ok(packRecalc.planExtraRub === 70000, 'recalc extra still 70k')

ok(
  formatHallPlanTopUpSummaryRu({
    ok: true,
    totalAmount: 1000,
    planExtraRub: 70,
    prevExtraRub: 100,
    planExtraPct: 70,
    budget: 900,
    level3Budget: 1000,
  }).includes('пакет залов'),
  'summary safe without targets (snapshot hydrate)',
)

if (failed) {
  console.error(`\n${failed} hall top-up check(s) failed`)
  process.exit(1)
}
console.log('\nAll sales plan hall top-up checks passed')
