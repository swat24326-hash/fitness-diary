/**
 * node scripts/verify-pnk-wizard.mjs
 */
import {
  buildPnkWizardAdvancePatch,
  buildPnkWizardStepList,
  canAdvancePnkWizardStep,
  normalizePnkTrialSessions,
  resolvePnkWizardStep,
} from '../src/lib/pnk/pnkWizardCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizePnkTrialSessions(2) === 2, 'sessions 2')
ok(normalizePnkTrialSessions(1) === 1, 'sessions 1')
ok(normalizePnkTrialSessions(99) === 1, 'sessions fallback')

const steps1 = buildPnkWizardStepList(1)
const steps2 = buildPnkWizardStepList(2)
ok(steps1.map((s) => s.key).join(',') === 'created,invite,health,nutrition,train1,hw1,followup,close', 'N=1 step list')
ok(
  steps2.map((s) => s.key).join(',') === 'created,invite,health,nutrition,train1,hw1,train2,hw2,followup,close',
  'N=2 step list',
)
ok(steps1.length === 8 && steps2.length === 10, 'step counts')

function baseClient(sessions) {
  return {
    id: 'c1',
    lifecycle: 'pnk',
    pnk_stage: 'assigned',
    pnk_trial_sessions: sessions,
    pnk_trial_date: null,
    pnk_deliverables: {},
  }
}

const empty1 = resolvePnkWizardStep(baseClient(1))
ok(empty1?.key === 'invite' && empty1.n === 2 && empty1.total === 8, 'N=1 starts at invite')

const empty2 = resolvePnkWizardStep(baseClient(2))
ok(empty2?.key === 'invite' && empty2.total === 10, 'N=2 starts at invite total 10')

const afterInvite = {
  ...baseClient(1),
  pnk_stage: 'agreed',
  pnk_trial_date: '2026-07-20',
  pnk_deliverables: { contact: '2026-07-19T10:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterInvite)?.key === 'health', 'after invite → health')

const healthCard = {
  height_cm: 170,
  initial_weight_kg: 70,
  sex: 'male',
  health_filled_at: '2026-07-01',
}
const healthStep = resolvePnkWizardStep(afterInvite, { healthCard })
ok(healthStep?.key === 'health', 'still health until deliverable')
ok(canAdvancePnkWizardStep(afterInvite, healthStep, { healthCard }).ok === true, 'health can advance with card')
ok(buildPnkWizardAdvancePatch(healthStep)?.deliverable === 'health', 'health advance patch')

const afterHealth = {
  ...afterInvite,
  pnk_deliverables: { ...afterInvite.pnk_deliverables, health: '2026-07-19T11:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterHealth)?.key === 'nutrition', '→ nutrition')

const afterNutrition = {
  ...afterHealth,
  pnk_deliverables: { ...afterHealth.pnk_deliverables, nutrition: '2026-07-19T12:00:00.000Z' },
}
const train1 = resolvePnkWizardStep(afterNutrition, { bzCompletedCount: 0 })
ok(train1?.key === 'train1', '→ train1')
ok(canAdvancePnkWizardStep(afterNutrition, train1, { bzCompletedCount: 0 }).ok === false, 'train1 blocked without workout')
ok(canAdvancePnkWizardStep(afterNutrition, train1, { bzCompletedCount: 1 }).ok === true, 'train1 ok with bz=1')

const afterTrain1 = {
  ...afterNutrition,
  pnk_stage: 'trial_done',
  pnk_deliverables: { ...afterNutrition.pnk_deliverables, trial: '2026-07-20T18:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterTrain1, { bzCompletedCount: 1 })?.key === 'hw1', 'N=1 → hw1')

const afterHw1 = {
  ...afterTrain1,
  pnk_deliverables: { ...afterTrain1.pnk_deliverables, homework: '2026-07-20T19:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterHw1, { bzCompletedCount: 1 })?.key === 'followup', 'N=1 skips train2 → followup')

const afterFollowup = {
  ...afterHw1,
  pnk_stage: 'followup',
  pnk_deliverables: { ...afterHw1.pnk_deliverables, followup: '2026-07-21T10:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterFollowup)?.key === 'close', 'N=1 → close')

/* N=2 path: after hw1 need train2 */
const n2AfterHw1 = {
  ...afterHw1,
  pnk_trial_sessions: 2,
}
const train2 = resolvePnkWizardStep(n2AfterHw1, { bzCompletedCount: 1 })
ok(train2?.key === 'train2', 'N=2 after hw1 → train2')
ok(canAdvancePnkWizardStep(n2AfterHw1, train2, { bzCompletedCount: 1 }).ok === false, 'train2 blocked at bz=1')
ok(canAdvancePnkWizardStep(n2AfterHw1, train2, { bzCompletedCount: 2 }).ok === true, 'train2 ok at bz=2')

const afterTrain2 = {
  ...n2AfterHw1,
  pnk_deliverables: { ...n2AfterHw1.pnk_deliverables, trial2: '2026-07-22T18:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterTrain2, { bzCompletedCount: 2 })?.key === 'hw2', 'N=2 → hw2')

const afterHw2 = {
  ...afterTrain2,
  pnk_deliverables: { ...afterTrain2.pnk_deliverables, homework2: '2026-07-22T19:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterHw2, { bzCompletedCount: 2 })?.key === 'followup', 'N=2 → followup after hw2')

ok(resolvePnkWizardStep({ lifecycle: 'active', pnk_stage: 'won' }) === null, 'closed client null')
ok(buildPnkWizardAdvancePatch({ key: 'train1' })?.deliverable === 'trial', 'train1 patch')
ok(buildPnkWizardAdvancePatch({ key: 'train2' })?.deliverable === 'trial2', 'train2 patch')
ok(buildPnkWizardAdvancePatch({ key: 'invite' }) === null, 'invite no advance patch')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
