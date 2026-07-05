import {

  aggregateMonthFromDailyRows,

  computeNetProfit,

  computeProfitDay,

  computeProfitFromMatrix,

  dailyFormToPayload,

  dailyRowToForm,

  monthDateRange,

  monthPartsFromIso,

  planProgressPercent,

  planFormToPayload,

  salesMatrixCellAvgCheck,

  salesMatrixRowAvgCheck,

  salesMatrixRowMembershipTotal,

} from '../src/lib/admin/salesReportCore.js'

import {

  clubAggregateInputMap,

  SALES_TRAINING_CLUB_ID,

  SALES_TRAINING_TYPE_NONE,

  salesTrainingCellKey,

} from '../src/lib/admin/salesTrainingsMatrix.js'



let failed = 0



function ok(cond, msg) {

  if (cond) console.log(`ok: ${msg}`)

  else {

    console.error(`FAIL: ${msg}`)

    failed++

  }

}



ok(computeProfitDay(100, 200, 50) === 350, 'profit_day sum')

ok(computeNetProfit(350, 100) === 250, 'net profit')

ok(planProgressPercent(500, 1000) === 50, 'plan 50%')

ok(planProgressPercent(500, 0) === 0, 'plan zero denominator')



const parts = monthPartsFromIso('2026-06-15')

ok(parts?.year === 2026 && parts?.month === 6, 'month parts')

const range = monthDateRange(2026, 6)

ok(range.start === '2026-06-01' && range.end === '2026-06-30', 'june range')



const formOk = dailyFormToPayload({

  pnk_total: '3',

  trainings_count: '12',

  pz_nk: '1',

  pz_nk_sum: '500',

  pz_dk: '0',

  pz_dk_sum: '',

  pz_uk: '0',

  tz_nk: '0',

  tz_dk: '2',

  tz_dk_sum: '400',

  tz_uk: '0',

  az_nk: '0',

  az_dk: '0',

  az_uk: '0',

})

ok(formOk.ok && formOk.payload.profit_nk === 500, 'profit nk from cell sums')

ok(formOk.ok && formOk.payload.profit_dk === 400, 'profit dk from cell sums')

ok(formOk.ok && formOk.payload.profit_uk === 0, 'profit uk zero')

ok(formOk.ok && formOk.payload.matrix_amounts.pz_nk === 500, 'matrix amounts stored')

ok(formOk.ok && formOk.payload.tz_dk === 2, 'matrix count')



const agg = aggregateMonthFromDailyRows([

  { profit_nk: 100, profit_dk: 50, profit_uk: 0, trainings_count: 5 },

  { profit_nk: 200, profit_dk: 0, profit_uk: 10, trainings_count: 3 },

])

ok(agg.profitTotal === 360, 'month profit total')

ok(agg.profitNk === 300, 'month nk')

ok(agg.trainingsTotal === 8, 'month trainings')

ok(agg.dayCount === 2, 'month days')



const planOk = planFormToPayload(
  {
    plan_level_1: '1 000 000',
    plan_level_2: '1 500 000',
    plan_level_3: '2 000 000',
    plan_pz: '0',
    plan_tz: '0',
    plan_az: '0',
  },
  { scope: 'levels' },
)
ok(planOk.ok && planOk.payload.plan_total === 2000000, 'plan parse')



const matrixOk = dailyFormToPayload(

  {

    pnk_total: '0',

    pz_nk: '0',

    pz_dk: '0',

    pz_uk: '0',

    tz_nk: '0',

    tz_dk: '0',

    tz_uk: '0',

    az_nk: '0',

    az_dk: '0',

    az_uk: '0',

  },

  {

    matrixInput: { 'tr1|type1': '2', 'tr1|type2': '1', 'tr2|__none__': '3' },

    trainerIds: ['tr1', 'tr2'],

    membershipTypes: [{ id: 'type1' }, { id: 'type2' }],

  },

)

ok(matrixOk.ok && matrixOk.payload.trainings_count === 6, 'matrix sum trainings_count')

ok(matrixOk.ok && matrixOk.payload.trainings_matrix.length === 3, 'matrix rows stored')



const matrixForm = {

  pz_nk: '2',

  pz_nk_sum: '1000',

  pz_dk: '1',

  pz_dk_sum: '200',

  pz_uk: '0',

  tz_nk: '0',

  tz_dk: '2',

  tz_dk_sum: '400',

  tz_uk: '0',

  az_nk: '0',

  az_dk: '0',

  az_uk: '0',

}

ok(salesMatrixRowMembershipTotal(matrixForm, 'pz') === 3, 'matrix row membership total')

ok(salesMatrixRowAvgCheck(matrixForm, 'pz') === 400, 'matrix row avg check')

ok(salesMatrixCellAvgCheck(matrixForm, 'pz_nk') === 500, 'cell avg = sum / count')



const profitCalc = computeProfitFromMatrix(matrixForm)

ok(profitCalc.ok && profitCalc.profit_nk === 1000, 'compute profit nk')

ok(profitCalc.ok && profitCalc.profit_dk === 600, 'compute profit dk')

ok(profitCalc.ok && profitCalc.profit_day === 1600, 'compute profit day')



const loaded = dailyRowToForm({

  pz_nk: 2,

  pz_dk: 1,

  matrix_amounts: { pz_nk: 1000, pz_dk: 200 },

})

ok(loaded.pz_nk_sum === '1000', 'load matrix amounts from db')



const cols = [{ typeId: 't1', code: 'Br' }, { typeId: SALES_TRAINING_TYPE_NONE, code: 'Без типа' }]

const aggMap = clubAggregateInputMap(

  {

    [salesTrainingCellKey('tr1', 't1')]: '2',

    [salesTrainingCellKey('tr2', 't1')]: '3',

  },

  ['tr1', 'tr2'],

  cols,

)

ok(aggMap[salesTrainingCellKey(SALES_TRAINING_CLUB_ID, 't1')] === '5', 'club aggregate from trainers')



if (failed > 0) {

  console.error(`\n${failed} check(s) failed`)

  process.exit(1)

}

console.log('\nAll club-sales-profit checks passed.')


