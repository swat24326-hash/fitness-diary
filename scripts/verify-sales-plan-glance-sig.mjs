/**
 * Сигнатура glance плана: часы внутри дня меняют loadSig без нового дня.
 * node scripts/verify-sales-plan-glance-sig.mjs
 */
import {
  salesPlanGlanceLoadSig,
  salesPlanGlanceLooksSame,
} from '../src/lib/admin/salesPlanGlanceSession.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const dayA = {
  trainings_matrix: [{ trainer_id: 't1', membership_type_id: 'mt1', count: 10 }],
  aerobic_sales_matrix: [],
}
const dayB = {
  trainings_matrix: [{ trainer_id: 't1', membership_type_id: 'mt1', count: 20 }],
  aerobic_sales_matrix: [],
}

const sigA = salesPlanGlanceLoadSig({ monthRows: [dayA], expense: 500000 })
const sigB = salesPlanGlanceLoadSig({ monthRows: [dayB], expense: 500000 })
ok(sigA !== sigB, 'same day count, different PZ hours → different sig')
ok(String(sigA).includes('500000'), 'sig includes expense')

const base = {
  fact: 803271,
  monthLabel: 'октябрь 2026',
  planLevels: { level1: 1150000, level2: 1250000, level3: 1350000 },
  forecastBundle: { monthRows: [dayA], expense: 500000, loadSig: sigA },
}
const newerHours = {
  ...base,
  forecastBundle: { monthRows: [dayB], expense: 500000, loadSig: sigB },
}
ok(!salesPlanGlanceLooksSame(base, newerHours), 'looksSame false when PZ hours change')
ok(salesPlanGlanceLooksSame(base, { ...base }), 'looksSame true for identical')

const noExpense = {
  ...base,
  forecastBundle: {
    monthRows: [dayA],
    expense: 0,
    loadSig: salesPlanGlanceLoadSig({ monthRows: [dayA], expense: 0 }),
  },
}
ok(!salesPlanGlanceLooksSame(base, noExpense), 'looksSame false when expense drops')

process.exit(failed > 0 ? 1 : 0)
