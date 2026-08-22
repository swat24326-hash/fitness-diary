/**
 * Вкладки карточки ПНК: только шаг мастера, не произвольный ?tab=.
 * node scripts/verify-pnk-coach-tab-sync.mjs
 */
import {
  isOpenPnkClient,
  isPnkCardTabVisible,
  resolvePnkTrainerUiStep,
} from '../src/lib/pnk/pnkStagesCore.js'
import { resolvePnkWizardStep } from '../src/lib/pnk/pnkWizardCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const afterNutrition = {
  id: 'c1',
  lifecycle: 'pnk',
  pnk_stage: 'agreed',
  pnk_trial_sessions: 1,
  pnk_trial_date: '2026-07-20',
  pnk_deliverables: {
    contact: 'x',
    visit_started: 'x',
    health: 'x',
    nutrition: 'x',
  },
}

const trainCtx = { bzCompletedCount: 0 }
const trainStep = resolvePnkTrainerUiStep(afterNutrition, trainCtx)
ok(trainStep?.key === 'train1' && trainStep.tab === 'diaries', 'train step → diaries tab')
ok(isOpenPnkClient(afterNutrition), 'open pnk')
ok(isPnkCardTabVisible(afterNutrition, 'diaries', trainCtx), 'diaries visible on train')
ok(!isPnkCardTabVisible(afterNutrition, 'health', trainCtx), 'health hidden on train')
ok(!isPnkCardTabVisible(afterNutrition, 'homework', trainCtx), 'homework hidden on train')

/** Симуляция: URL ?tab=health при шаге train1 — контент health не должен показываться */
const urlTab = 'health'
const showHealth = urlTab === 'health' && isPnkCardTabVisible(afterNutrition, 'health', trainCtx)
ok(!showHealth, '?tab=health не открывает health на train1')

/** Симуляция ClientCard: при открытом ПНК searchParams не меняет вкладку мастера */
const wouldApplyUrlTab = (client, t) => {
  if (client && isOpenPnkClient(client)) return false
  return t === 'health'
}
ok(!wouldApplyUrlTab(afterNutrition, 'health'), 'open PNK: skip URL tab override')

const afterFollowup = {
  ...afterNutrition,
  pnk_stage: 'followup',
  pnk_deliverables: {
    ...afterNutrition.pnk_deliverables,
    trial: 'x',
    homework: 'x',
    followup: '2026-07-21T10:00:00.000Z',
  },
}
const closeStep = resolvePnkTrainerUiStep(afterFollowup)
ok(closeStep?.key === 'close' && closeStep.tab === null, 'close step')
ok(isPnkCardTabVisible(afterFollowup, 'memberships'), 'memberships on close')
ok(!isPnkCardTabVisible(afterFollowup, 'homework'), 'homework hidden on close')

const onFollowup = {
  ...afterNutrition,
  pnk_deliverables: {
    ...afterNutrition.pnk_deliverables,
    trial: 'x',
    homework: 'x',
  },
}
ok(resolvePnkWizardStep(onFollowup, { bzCompletedCount: 1 })?.key === 'followup', 'followup step')
ok(!isPnkCardTabVisible(onFollowup, 'homework', { bzCompletedCount: 1 }), 'no homework tab on followup')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-coach-tab-sync: all ok')
