/**
 * node scripts/verify-pnk-wizard.mjs
 */
import {
  buildPnkWizardAdvancePatch,
  buildPnkWizardStepList,
  buildPnkVisitStartedPatch,
  canAdvancePnkWizardStep,
  canStartPnkTrialTraining,
  isPnkVisitPackageOpen,
  normalizePnkTrialSessions,
  resolvePnkWizardStep,
} from '../src/lib/pnk/pnkWizardCore.js'
import { isPnkCardTabVisible } from '../src/lib/pnk/pnkStagesCore.js'

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
ok(
  steps1.map((s) => s.key).join(',') ===
    'created,invite,wait,health,nutrition,train1,hw1,followup,close',
  'N=1 step list',
)
ok(
  steps2.map((s) => s.key).join(',') ===
    'created,invite,wait,health,nutrition,train1,hw1,train2,hw2,followup,close',
  'N=2 step list',
)
ok(steps1.length === 9 && steps2.length === 11, 'step counts')

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
ok(empty1?.key === 'invite' && empty1.n === 2 && empty1.total === 9, 'N=1 starts at invite')

const empty2 = resolvePnkWizardStep(baseClient(2))
ok(empty2?.key === 'invite' && empty2.total === 11, 'N=2 starts at invite total 11')

const afterInvite = {
  ...baseClient(1),
  pnk_stage: 'agreed',
  pnk_trial_date: '2026-07-20',
  pnk_deliverables: { contact: '2026-07-19T10:00:00.000Z' },
}
const beforeVisit = new Date('2026-07-17T12:00:00')
ok(resolvePnkWizardStep(afterInvite, { now: beforeVisit })?.key === 'wait', 'after invite → wait before date')

ok(buildPnkVisitStartedPatch()?.deliverable === 'visit_started', 'visit started patch')
const arrived = {
  ...afterInvite,
  pnk_deliverables: { ...afterInvite.pnk_deliverables, visit_started: '2026-07-17T12:00:00.000Z' },
}
ok(resolvePnkWizardStep(arrived, { now: beforeVisit })?.key === 'health', 'Клиент пришёл → health')
ok(isPnkVisitPackageOpen(arrived, { visit_started: 'x', health: null, nutrition: null, trial: null, homework: null, trial2: null, homework2: null, contact: 'x', followup: null }, beforeVisit), 'package open after visit_started')

const onVisitDay = resolvePnkWizardStep(afterInvite, { now: new Date('2026-07-20T09:00:00') })
ok(onVisitDay?.key === 'wait', 'visit day still wait until Клиент пришёл')
ok(
  !isPnkVisitPackageOpen(
    afterInvite,
    {
      visit_started: null,
      health: null,
      nutrition: null,
      trial: null,
      homework: null,
      trial2: null,
      homework2: null,
      contact: 'x',
      followup: null,
    },
    new Date('2026-07-20T09:00:00'),
  ),
  'date alone does not open package',
)

const healthCard = {
  height_cm: 170,
  initial_weight_kg: 70,
  sex: 'male',
  health_filled_at: '2026-07-01',
}
const healthStep = resolvePnkWizardStep(arrived, { healthCard, now: beforeVisit })
ok(healthStep?.key === 'health', 'still health until deliverable')
ok(canAdvancePnkWizardStep(arrived, healthStep, { healthCard }).ok === true, 'health can advance with card')
ok(buildPnkWizardAdvancePatch(healthStep)?.deliverable === 'health', 'health advance patch')

const afterHealth = {
  ...arrived,
  pnk_deliverables: { ...arrived.pnk_deliverables, health: '2026-07-19T11:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterHealth)?.key === 'nutrition', '→ nutrition')
const nutritionStep = resolvePnkWizardStep(afterHealth)
ok(canAdvancePnkWizardStep(afterHealth, nutritionStep).ok === false, 'nutrition blocked until saved')
ok(
  canAdvancePnkWizardStep(afterHealth, nutritionStep, {
    healthCard: { nutrition_plan: { meals: [{ items: [] }] } },
  }).ok === true,
  'nutrition Next ok after plan saved (no deliverable yet)',
)
ok(resolvePnkWizardStep(afterHealth)?.key === 'nutrition', 'stay on nutrition until Next')
ok(buildPnkWizardAdvancePatch(nutritionStep)?.deliverable === 'nutrition', 'nutrition advance patch')

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
ok(resolvePnkWizardStep(afterTrain1)?.key === 'hw1', '→ hw1 after trial')

// Пропуск питания + пробная: не возвращаем на «Питание»
const trialWithoutNutrition = {
  ...arrived,
  pnk_stage: 'trial_done',
  pnk_deliverables: {
    ...arrived.pnk_deliverables,
    health: '2026-07-19T11:00:00.000Z',
    trial: '2026-07-20T18:00:00.000Z',
  },
}
ok(resolvePnkWizardStep(trialWithoutNutrition)?.key === 'hw1', 'trial without nutrition → hw1 not nutrition')
ok(resolvePnkWizardStep(trialWithoutNutrition, { bzCompletedCount: 1 })?.key === 'hw1', 'bzDone without nutrition → hw1')
ok(resolvePnkWizardStep(afterTrain1, { bzCompletedCount: 1 })?.key === 'hw1', 'N=1 → hw1')
const hw1Step = resolvePnkWizardStep(afterTrain1, { bzCompletedCount: 1 })
ok(canAdvancePnkWizardStep(afterTrain1, hw1Step, { bzCompletedCount: 1 }).ok === true, 'hw1 Next ok (marks ДЗ)')

const afterHw1 = {
  ...afterTrain1,
  pnk_deliverables: { ...afterTrain1.pnk_deliverables, homework: '2026-07-20T19:00:00.000Z' },
}
ok(canAdvancePnkWizardStep(afterHw1, hw1Step, { bzCompletedCount: 1 }).ok === true, 'hw1 ok when issued')
ok(resolvePnkWizardStep(afterHw1, { bzCompletedCount: 1 })?.key === 'followup', 'N=1 skips train2 → followup')

const afterFollowup = {
  ...afterHw1,
  pnk_stage: 'followup',
  pnk_deliverables: { ...afterHw1.pnk_deliverables, followup: '2026-07-21T10:00:00.000Z' },
}
ok(resolvePnkWizardStep(afterFollowup)?.key === 'close', 'N=1 → close')

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
ok(buildPnkWizardAdvancePatch({ key: 'wait' }) === null, 'wait no advance patch')

function onlyTab(client, expectTab, label, extraVisible = []) {
  const tabs = ['health', 'nutrition', 'homework', 'diaries', 'memberships', 'stats']
  const allowed = new Set(expectTab == null ? extraVisible : [expectTab, ...extraVisible])
  for (const t of tabs) {
    const vis = isPnkCardTabVisible(client, t, { now: beforeVisit })
    if (expectTab == null && extraVisible.length === 0) {
      ok(!vis, `${label}: ${t} hidden`)
    } else if (allowed.has(t)) {
      ok(vis, `${label}: ${t} visible`)
    } else {
      ok(!vis, `${label}: ${t} hidden`)
    }
  }
}

onlyTab(baseClient(1), null, 'invite')
onlyTab(afterInvite, null, 'wait')
onlyTab(arrived, 'health', 'health step')
onlyTab(afterHealth, 'nutrition', 'nutrition step')
onlyTab(afterNutrition, 'diaries', 'train step')
onlyTab(afterTrain1, 'homework', 'hw step')
onlyTab(afterFollowup, null, 'close step', ['memberships'])

ok(!canStartPnkTrialTraining(afterHealth).ok, 'block train before nutrition')
ok(canStartPnkTrialTraining(afterNutrition).ok, 'allow train on train1')
ok(!canStartPnkTrialTraining(afterTrain1).ok, 'block train on homework step')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
