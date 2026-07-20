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

const scheduled = buildPnkVisitQualityReport(
  {
    lifecycle: 'pnk',
    pnk_stage: 'agreed',
    pnk_trial_sessions: 1,
    pnk_trial_date: '2026-07-21',
    pnk_trial_time: '19:00',
    pnk_deliverables: { contact: 'x' },
  },
  { bzCompletedCount: 0 },
)
const trialItem = scheduled.items.find((i) => i.key === 'trial')
ok(trialItem?.status === 'weak', 'scheduled trial is weak not missing')
ok(/21\.07\.2026/.test(trialItem?.note || '') && /19:00/.test(trialItem?.note || ''), 'scheduled trial shows date/time')

const noDate = buildPnkVisitQualityReport(
  {
    lifecycle: 'pnk',
    pnk_stage: 'contact',
    pnk_trial_sessions: 1,
    pnk_deliverables: { contact: 'x' },
  },
  { bzCompletedCount: 0 },
)
ok(noDate.items.find((i) => i.key === 'trial')?.status === 'missing', 'no date → missing')
ok(noDate.items.find((i) => i.key === 'trial_date')?.status === 'missing', 'trial_date missing')
ok(/дата не назначена/i.test(noDate.items.find((i) => i.key === 'trial_date')?.note || ''), 'no date note')
ok(noDate.phases?.length >= 2, 'phases present')

const frac = formatPnkConversionFraction(10, 4)
ok(frac.fraction === '4/10' && frac.pct === 40, 'conversion fraction')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-visit-quality: all ok')
