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
ok(r1.items.some((i) => i.key === 'health' && i.status === 'missing'), 'health missing after visit start')
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
ok(r2.items.find((i) => i.key === 'health')?.status === 'done', 'health+measures done')
ok(r2.items.find((i) => i.key === 'health')?.label === 'Здоровье и обмеры', 'combined label')
ok(!r2.items.some((i) => i.key === 'measurements'), 'no separate measurements item')
ok(r2.items.find((i) => i.key === 'health')?.phase === 'visit', 'health+measures in visit phase')
ok(r2.items.find((i) => i.key === 'nutrition')?.status === 'done', 'nutrition done')
ok(r2.items.find((i) => i.key === 'outcome')?.status === 'done', 'outcome won')
ok(r2.summaryLine.includes('полный') || r2.done >= 7, 'strong summary')

const healthNoMeasures = buildPnkVisitQualityReport(incomplete, {
  healthCard: fullHealth,
  bzCompletedCount: 0,
  hasMeasurements: false,
})
ok(healthNoMeasures.items.find((i) => i.key === 'health')?.status === 'weak', 'health without measures is weak')
ok(/обмеров нет/i.test(healthNoMeasures.items.find((i) => i.key === 'health')?.note || ''), 'weak note')

const healthUnknownMeasures = buildPnkVisitQualityReport(incomplete, {
  healthCard: fullHealth,
  bzCompletedCount: 0,
})
ok(healthUnknownMeasures.items.find((i) => i.key === 'health')?.status === 'done', 'board without measure data: health alone ok')

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
ok(trialItem?.status === 'pending', 'scheduled trial pending until visit start')
ok(trialItem?.note?.includes('После начала'), 'pending note')
const startItem = scheduled.items.find((i) => i.key === 'visit_started')
ok(startItem?.label === 'Начало тренировки', 'visit_started label')
ok(startItem?.status === 'pending', 'visit_started pending while waiting in hall')
ok(/21\.07\.2026/.test(startItem?.note || '') && /19:00/.test(startItem?.note || ''), 'start shows free slot')
ok(scheduled.pending > 0, 'has pending count')
ok(scheduled.done === 2, 'contact + date done before hall')
ok(scheduled.missing === 0, 'no missing when waiting with date set')
ok(scheduled.total === 2, 'score only contact+date before hall')
ok(scheduled.summaryLine.includes('ждём зал') || scheduled.pending > 0, 'summary waits for hall')

const noDate = buildPnkVisitQualityReport(
  {
    lifecycle: 'pnk',
    pnk_stage: 'contact',
    pnk_trial_sessions: 1,
    pnk_deliverables: { contact: 'x' },
  },
  { bzCompletedCount: 0 },
)
ok(noDate.items.find((i) => i.key === 'trial')?.status === 'pending', 'no date trial still pending before hall')
ok(noDate.items.find((i) => i.key === 'visit_started')?.status === 'pending', 'visit_started pending without date')
ok(noDate.items.find((i) => i.key === 'trial_date')?.status === 'missing', 'trial_date missing')
ok(/дата не назначена/i.test(noDate.items.find((i) => i.key === 'trial_date')?.note || ''), 'no date note')
ok(noDate.phases?.length >= 2, 'phases present')
ok(noDate.missing === 1, 'only trial_date missing without date')

const afterStart = buildPnkVisitQualityReport(
  {
    lifecycle: 'pnk',
    pnk_stage: 'agreed',
    pnk_trial_sessions: 1,
    pnk_trial_date: '2026-07-21',
    pnk_trial_time: '19:00',
    pnk_deliverables: { contact: 'x', visit_started: 'x' },
  },
  { bzCompletedCount: 0 },
)
ok(afterStart.items.find((i) => i.key === 'trial')?.status === 'weak', 'after start scheduled trial is weak')
ok(afterStart.pending === 0, 'no pending after visit start')

const frac = formatPnkConversionFraction(10, 4)
ok(frac.fraction === '4/10' && frac.pct === 40, 'conversion fraction')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-visit-quality: all ok')
