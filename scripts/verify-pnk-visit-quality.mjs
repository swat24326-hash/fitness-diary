/**
 * node scripts/verify-pnk-visit-quality.mjs
 */
import {
  buildPnkVisitQualityReport,
  formatPnkConversionFraction,
  shouldShowPnkVisitQuality,
} from '../src/lib/pnk/pnkVisitQualityCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const incomplete = {
  lifecycle: 'pnk',
  pnk_stage: 'agreed',
  pnk_trial_sessions: 1,
  pnk_deliverables: { contact: 'x', visit_started: 'x' },
}
ok(shouldShowPnkVisitQuality(incomplete), 'show for open pnk')
const r1 = buildPnkVisitQualityReport(incomplete, { healthCard: null, bzCompletedCount: 0 })
ok(r1.items.some((i) => i.key === 'health' && i.status === 'missing'), 'health missing')
ok(r1.missing > 0, 'has missing')

const fullHealth = {
  height_cm: 180,
  initial_weight_kg: 80,
  sex: 'male',
  health_filled_at: '2026-07-01',
  nutrition_plan: { meals: [{ items: [] }] },
}
const strong = {
  lifecycle: 'active',
  pnk_stage: 'won',
  pnk_won_at: '2026-07-17',
  pnk_created_at: '2026-07-10',
  pnk_trial_sessions: 1,
  pnk_deliverables: {
    contact: 'x',
    visit_started: 'x',
    health: 'x',
    nutrition: 'x',
    trial: 'x',
    homework: 'x',
    followup: 'x',
  },
}
ok(shouldShowPnkVisitQuality(strong), 'show for won')
const r2 = buildPnkVisitQualityReport(strong, {
  healthCard: fullHealth,
  bzCompletedCount: 1,
  hasMeasurements: true,
})
ok(r2.items.find((i) => i.key === 'health')?.status === 'done', 'health done')
ok(r2.items.find((i) => i.key === 'nutrition')?.status === 'done', 'nutrition done')
ok(r2.items.find((i) => i.key === 'outcome')?.status === 'done', 'outcome won')
ok(r2.summaryLine.includes('полный') || r2.done >= 7, 'strong summary')

const weakNutrition = buildPnkVisitQualityReport(
  {
    ...incomplete,
    pnk_deliverables: { ...incomplete.pnk_deliverables, health: 'x', nutrition: 'x' },
  },
  {
    healthCard: {
      height_cm: 180,
      initial_weight_kg: 80,
      sex: 'male',
      health_filled_at: '2026-07-01',
    },
    bzCompletedCount: 0,
  },
)
ok(weakNutrition.items.find((i) => i.key === 'nutrition')?.status === 'weak', 'nutrition weak without plan')

const frac = formatPnkConversionFraction(10, 4)
ok(frac.fraction === '4/10' && frac.pct === 40, 'conversion fraction')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-visit-quality: all ok')
