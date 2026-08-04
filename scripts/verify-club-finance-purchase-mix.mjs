import {
  blendCellForecastWithPlan,
  blendClubGrossForecast,
  buildPurchaseMixForecast,
  parseMixCellKey,
  PURCHASE_MIX_BLEND_WEIGHT,
  PURCHASE_MIX_COVERAGE_TRUST,
} from '../src/lib/admin/clubFinancePurchaseMixForecastCore.js'
import { planMatrixAvgField, planMatrixCountField } from '../src/lib/admin/salesPlanMatrixCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseMixCellKey('pz_dk')?.hall === 'pz' && parseMixCellKey('pz_dk')?.category === 'dk', 'parse cell')
ok(parseMixCellKey('dop_nk') == null, 'dop not hall cell')

const paceOnly = blendCellForecastWithPlan({ fact: 100, paceForecast: 200, planRub: 0 })
ok(paceOnly.method === 'pace_only' && paceOnly.forecast === 200, 'pace only')

const above = blendCellForecastWithPlan({ fact: 100, paceForecast: 500, planRub: 300 })
ok(above.method === 'pace_above_plan' && above.forecast === 500, 'pace above plan')

const blend = blendCellForecastWithPlan({
  fact: 100,
  paceForecast: 200,
  planRub: 400,
  category: 'nk',
})
ok(blend.method === 'pace_plan_blend', 'blend method nk')
ok(blend.forecast === 290, 'nk blend 0.55*200+0.45*400')

const blendDk = blendCellForecastWithPlan({
  fact: 100,
  paceForecast: 200,
  planRub: 400,
  category: 'dk',
})
ok(blendDk.method === 'pace_plan_blend_dk', 'blend method dk')
ok(blendDk.forecast === 330, 'dk blend 0.35*200+0.65*400')

const clubWeak = blendClubGrossForecast({
  mixForecastGross: 100,
  profitPaceGross: 1000,
  factMixGross: 50,
  factProfitGross: 1000,
})
ok(!clubWeak.trusted && clubWeak.method === 'profit_pace', 'low coverage → profit')

const clubOk = blendClubGrossForecast({
  mixForecastGross: 800,
  profitPaceGross: 1000,
  factMixGross: 600,
  factProfitGross: 1000,
})
ok(clubOk.trusted && clubOk.coverage >= PURCHASE_MIX_COVERAGE_TRUST, 'trusted coverage')
ok(clubOk.mixWeight > PURCHASE_MIX_BLEND_WEIGHT, 'higher coverage → higher mix weight')
const expected = clubOk.mixWeight * 800 + (1 - clubOk.mixWeight) * 1000
ok(Math.abs(clubOk.forecastGross - expected) < 0.02, 'club blend weight')

const planForm = {
  [planMatrixCountField('pz_dk')]: '2',
  [planMatrixAvgField('pz_dk')]: '10000',
  [planMatrixCountField('tz_nk')]: '1',
  [planMatrixAvgField('tz_nk')]: '5000',
}

const rows = [
  {
    report_date: '2026-08-01',
    matrix_amounts: { pz_dk: 10000, tz_nk: 5000, az_uk: 0 },
    pz_dk: 1,
    tz_nk: 1,
  },
  {
    report_date: '2026-08-02',
    matrix_amounts: { pz_dk: 10000, tz_nk: 0 },
    pz_dk: 1,
    tz_nk: 0,
  },
]

const mix = buildPurchaseMixForecast({
  monthRows: rows,
  year: 2026,
  month: 8,
  planForm,
  closedMonth: false,
  factProfitGross: 25000,
  profitPaceGross: 40000,
})
ok(mix.ok, 'mix ok')
ok(mix.byCategory.dk.fact === 20000, 'dk fact')
ok(mix.byHall.pz.plan === 20000, 'pz plan from matrix')
ok(mix.byHall.tz.plan === 5000, 'tz plan')
ok(mix.factMixGross === 25000, 'fact mix sum')

if (failed) {
  console.error(`\n${failed} purchase mix check(s) failed`)
  process.exit(1)
}
console.log('\nAll club finance purchase mix checks passed')
