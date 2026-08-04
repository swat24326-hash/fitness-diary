import {
  describeTopUpPackBudgetDeltaRu,
  rebuildTopUpPackTotalsFromCells,
  setTopUpPackNkUkCell,
} from '../src/lib/admin/salesStrategyNkUkEditCore.js'
import { strategyNkUkHowWeCountRu } from '../src/lib/admin/salesStrategyNkUkHowWeCountCore.js'
import { HALL_TOP_UP_BUDGET_TOLERANCE_RUB } from '../src/lib/admin/salesPlanHallTopUpCore.js'
import { planMatrixCellRub } from '../src/lib/admin/salesPlanMatrixCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

/** @type {object} */
const basePack = {
  ok: true,
  budget: 1_000_000,
  planExtraRub: 50_000,
  level3Budget: 1_050_000,
  budgetTolerance: HALL_TOP_UP_BUDGET_TOLERANCE_RUB,
  cells: {
    pz_nk: { count: 10, avg_check: 5000, amount: 50_000, source: 'algo' },
    pz_dk: { count: 20, avg_check: 8000, amount: 160_000, source: 'renewals' },
    pz_uk: { count: 5, avg_check: 4000, amount: 20_000, source: 'algo' },
    tz_nk: { count: 0, avg_check: 0, amount: 0, source: 'algo' },
    tz_dk: { count: 10, avg_check: 2000, amount: 20_000, source: 'renewals' },
    tz_uk: { count: 0, avg_check: 0, amount: 0, source: 'algo' },
    az_nk: { count: 0, avg_check: 0, amount: 0, source: 'algo' },
    az_dk: { count: 5, avg_check: 3000, amount: 15_000, source: 'renewals' },
    az_uk: { count: 0, avg_check: 0, amount: 0, source: 'algo' },
  },
  byHall: {
    pz: { label: 'ПЗ', planTarget: 230000, nk: 50000, dk: 160000, uk: 20000, total: 230000, topUp: 70000 },
    tz: { label: 'ТЗ', planTarget: 20000, nk: 0, dk: 20000, uk: 0, total: 20000, topUp: 0 },
    az: { label: 'АЗ', planTarget: 15000, nk: 0, dk: 15000, uk: 0, total: 15000, topUp: 0 },
  },
  totalAmount: 265_000,
  totalTopUp: 70_000,
  totalWithExtra: 315_000,
  budgetDelta: -735_000,
  fittedToBudget: false,
}

const rebuilt = rebuildTopUpPackTotalsFromCells(basePack)
ok(rebuilt.totalAmount === 265_000, 'rebuild keeps pack total')
ok(rebuilt.byHall.pz.dk === 160_000, 'dk unchanged')
ok(rebuilt.totalWithExtra === 315_000, 'with extra')

const edited = setTopUpPackNkUkCell(basePack, 'pz', 'nk', { count: 20, avg_check: 5000 })
ok(edited.ok, 'edit nk ok')
ok(edited.pack.manualNkUk === true, 'manual flag')
ok(edited.pack.cells.pz_nk.count === 20, 'nk count 20')
ok(edited.pack.cells.pz_nk.amount === planMatrixCellRub(20, 5000), 'nk amount = 20×5000')
ok(edited.pack.cells.pz_dk.amount === 160_000, 'dk cell untouched')
ok(edited.pack.byHall.pz.nk === 100_000, 'hall nk updated')
ok(edited.pack.byHall.pz.total === 280_000, 'hall total nk+dk+uk')
ok(edited.pack.totalAmount === 315_000, 'club total after +50k nk')
ok(edited.pack.budgetDelta === -685_000, 'budget delta updated')

const rejectDk = setTopUpPackNkUkCell(basePack, 'pz', 'dk', { count: 1 })
ok(!rejectDk.ok, 'cannot edit dk via helper')

const bad = setTopUpPackNkUkCell(basePack, 'pz', 'nk', { count: 'x' })
ok(!bad.ok, 'reject bad count')

const msg = describeTopUpPackBudgetDeltaRu(edited.pack)
ok(typeof msg === 'string' && msg.includes('Не хватает'), 'delta ru shortfall')

const fittedPack = rebuildTopUpPackTotalsFromCells({
  ...basePack,
  budget: 265_000,
  cells: basePack.cells,
})
ok(fittedPack.fittedToBudget === true, 'exact budget fits')
ok(describeTopUpPackBudgetDeltaRu(fittedPack).includes('совпадает'), 'delta ru match')

const how = strategyNkUkHowWeCountRu({ planExtraPct: 70, budgetTolerance: 15000 })
ok(how.title.includes('ПЗ'), 'how-we-count title mentions halls')
ok(how.steps.length >= 4, 'how-we-count has steps')
ok(how.steps.some((s) => s.includes('ДК')), 'how-we-count mentions DK')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales-strategy-nk-uk-edit checks passed')
