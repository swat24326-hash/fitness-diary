/**
 * Якорь зала × сезонность для вкладки «Стратегия».
 * node scripts/verify-sales-hall-anchor.mjs
 */
import {
  HALL_ANCHOR_MIN_FILL_RATIO,
  buildHallAnchorProjection,
  daysInCalendarMonth,
  gapToPlanLevel3,
  mergeStrategyPlanFormWithClub,
  previousCalendarYearMonth,
  pzDkShareOfAnchor,
  summarizeHallMonthFromDailyRows,
} from '../src/lib/admin/salesHallAnchorCore.js'
import {
  SALES_SEASON_DEFAULTS,
  getSalesSeasonMonthDef,
  salesSeasonScale,
} from '../src/lib/admin/salesSeasonCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(daysInCalendarMonth(2026, 2) === 28, 'days Feb 2026')
ok(daysInCalendarMonth(2026, 13) == null, 'bad month → null')

ok(previousCalendarYearMonth(2026, 8)?.month === 7, 'prev Aug → Jul')
ok(previousCalendarYearMonth(2026, 1)?.year === 2025 && previousCalendarYearMonth(2026, 1)?.month === 12, 'prev Jan → Dec')

ok(getSalesSeasonMonthDef(3)?.coef === 1.15, 'Mar season')
ok(getSalesSeasonMonthDef(7)?.coef === 0.85, 'Jul soft')
ok(getSalesSeasonMonthDef(12)?.coef === 0.8, 'Dec soft')
ok(getSalesSeasonMonthDef(1)?.mode === 'mixed', 'Jan mixed')
ok(Object.keys(SALES_SEASON_DEFAULTS).length === 12, '12 months in table')

const julToAug = salesSeasonScale(7, 8)
ok(julToAug === 1, 'Jul→Aug same soft coef → scale 1')

const julToOct = salesSeasonScale(7, 10)
ok(julToOct != null && julToOct > 1, 'Jul soft → Oct season → scale > 1')
ok(Math.abs(julToOct - 1.15 / 0.85) < 0.002, 'Jul→Oct scale = 1.15/0.85')

const rows = [
  { profit_nk: 40000, profit_dk: 60000, profit_uk: 0, trainings_count: 40 },
  { profit_nk: 50000, profit_dk: 70000, profit_uk: 0, trainings_count: 45 },
]
const sum = summarizeHallMonthFromDailyRows(rows)
ok(sum.hours === 85, 'hours sum')
ok(sum.rub === 220000, 'rub sum')
ok(sum.rubDk === 130000, 'rubDk sum')
ok(sum.dayCount === 2, 'dayCount')

// Август база (soft 0.85) → сентябрь план (soft 0.85)
const projSoft = buildHallAnchorProjection({
  baseRows: Array.from({ length: 20 }, () => ({
    profit_nk: 6000,
    profit_dk: 4000,
    profit_uk: 0,
    trainings_count: 10,
  })),
  baseYear: 2026,
  baseMonth: 8,
  planYear: 2026,
  planMonth: 9,
})
ok(projSoft.ok, 'projection soft→soft ok')
ok(projSoft.scale === 1, 'Aug→Sep scale 1')
ok(projSoft.expectedHours === 200, 'expected hours')
ok(projSoft.expectedRub === 200000, 'expected rub')
ok(projSoft.reliable === true, '20/31 days reliable (≥50%)')
ok(HALL_ANCHOR_MIN_FILL_RATIO === 0.5, 'min fill 0.5')

const thin = buildHallAnchorProjection({
  baseRows: [{ profit_nk: 1000, profit_dk: 0, profit_uk: 0, trainings_count: 1 }],
  baseYear: 2026,
  baseMonth: 7,
  planYear: 2026,
  planMonth: 10,
})
ok(thin.ok && thin.reliable === false, '1 day → unreliable')
ok(thin.scale != null && thin.scale > 1, 'Jul→Oct scales up')

ok(gapToPlanLevel3(300000, 200000) === 100000, 'gap to L3')
ok(gapToPlanLevel3(100000, 200000) === 0, 'no gap if above')
ok(pzDkShareOfAnchor(50000, 200000) === 0.25, 'pz share 25%')
ok(pzDkShareOfAnchor(0, 0) == null, 'share null if no anchor')

const merged = mergeStrategyPlanFormWithClub(
  { plan_level_3: '' },
  { plan_level_3: '1200000', plan_level_1: '1000000' },
  { year: 2026, month: 8 },
  { year: 2026, month: 8 },
)
ok(merged.plan_level_3 === '1200000', 'merge L3 from club form')
ok(merged.plan_level_1 === '1000000', 'merge L1 from club form')
const overwritten = mergeStrategyPlanFormWithClub(
  { plan_level_3: '999' },
  { plan_level_3: '1200000' },
  { year: 2026, month: 8 },
  { year: 2026, month: 8 },
)
ok(overwritten.plan_level_3 === '1200000', 'club L3 overwrites strategy')
const noMerge = mergeStrategyPlanFormWithClub(
  { plan_level_3: '' },
  { plan_level_3: '1200000' },
  { year: 2026, month: 8 },
  { year: 2026, month: 9 },
)
ok(noMerge.plan_level_3 === '', 'no merge if month mismatch')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales hall anchor checks passed')
