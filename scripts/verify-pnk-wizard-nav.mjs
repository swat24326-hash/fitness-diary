/**
 * node scripts/verify-pnk-wizard-nav.mjs
 */
import {
  buildPnkWizardBackClearPatch,
  buildPnkWizardHatNextPatch,
  buildPnkWizardSkipPatch,
  canSkipPnkWizardStep,
  resolvePnkFunnelHatNav,
  resolvePnkStepPrimarySlot,
} from '../src/lib/pnk/pnkWizardNavCore.js'
import { resolvePnkWizardStep } from '../src/lib/pnk/pnkWizardCore.js'
import { applyPnkStagePatch, clearPnkDeliverable } from '../src/lib/pnk/pnkStagesCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const base = {
  id: 'c1',
  lifecycle: 'pnk',
  pnk_stage: 'agreed',
  pnk_trial_sessions: 1,
  pnk_trial_date: '2026-07-20',
  pnk_deliverables: { contact: 'x' },
}

const waitStep = resolvePnkWizardStep(base)
ok(waitStep?.key === 'wait', 'on wait')
const waitNav = resolvePnkFunnelHatNav(base, waitStep, {})
ok(waitNav.canNext && waitNav.nextPatch?.deliverable === 'visit_started', 'wait Next = клиент пришёл')
ok(waitNav.nextLabel === 'Клиент пришёл', 'wait CTA label')
ok(waitNav.primarySlot === 'hat', 'wait primary in hat')
ok(!waitNav.canSkip, 'wait no skip')
ok(waitNav.canBack && waitNav.backPatch?.trial_date === '', 'wait Back clears trial date')

const trainClient = {
  ...base,
  pnk_deliverables: { contact: 'x', visit_started: 'x', health: 'x', nutrition: 'x' },
}
const trainStep = resolvePnkWizardStep(trainClient, { bzCompletedCount: 0 })
ok(trainStep?.key === 'train1', 'on train1')
ok(resolvePnkStepPrimarySlot(trainStep, { canNext: false }) === 'body', 'train CTA in body before BZ')
ok(resolvePnkStepPrimarySlot(trainStep, { canNext: true }) === 'hat', 'train CTA in hat after BZ')

const arrivedForBack = {
  ...base,
  pnk_deliverables: { contact: 'x', visit_started: 'x', health: 'x', nutrition: 'x', trial: 'x' },
}
const hw1Step = resolvePnkWizardStep(arrivedForBack, { bzCompletedCount: 1 })
ok(hw1Step?.key === 'hw1', 'on hw1 for back risk')
const hw1Nav = resolvePnkFunnelHatNav(arrivedForBack, hw1Step, { bzCompletedCount: 1 })
ok(!hw1Nav.canBack && hw1Nav.backRisky, 'hw1 Back gray (risky)')

const healthNav = resolvePnkFunnelHatNav(
  { ...base, pnk_deliverables: { contact: 'x', visit_started: 'x' } },
  resolvePnkWizardStep({ ...base, pnk_deliverables: { contact: 'x', visit_started: 'x' } }),
  {},
)
ok(healthNav.canBack && !healthNav.backRisky, 'health Back ok (safe)')

const contactClient = {
  ...base,
  pnk_trial_date: null,
  pnk_deliverables: {},
}
const contactStep = resolvePnkWizardStep(contactClient)
ok(contactStep?.key === 'contact', 'on contact')
const contactNav = resolvePnkFunnelHatNav(contactClient, contactStep, {})
ok(contactNav.canNext && contactNav.nextPatch?.deliverable === 'contact', 'contact Next marks contact')

const dateClient = {
  ...base,
  pnk_trial_date: null,
  pnk_deliverables: { contact: 'x' },
}
const dateStep = resolvePnkWizardStep(dateClient)
ok(dateStep?.key === 'date', 'on date')
const dateNav = resolvePnkFunnelHatNav(dateClient, dateStep, { trialDate: '2026-07-21' })
ok(dateNav.canNext, 'date Next with draft date')
ok(
  buildPnkWizardHatNextPatch(dateStep, { trialDate: '2026-07-21' })?.stage === 'agreed',
  'date hat patch',
)

const healthClient = {
  ...base,
  pnk_deliverables: { contact: 'x', visit_started: 'x' },
}
const healthStep = resolvePnkWizardStep(healthClient)
ok(!canSkipPnkWizardStep(healthStep).ok, 'health cannot skip')
ok(buildPnkWizardBackClearPatch(healthStep)?.clear_deliverable === 'visit_started', 'health back')

const nutritionClient = {
  ...healthClient,
  pnk_deliverables: { ...healthClient.pnk_deliverables, health: 'x' },
}
const nutritionStep = resolvePnkWizardStep(nutritionClient)
ok(canSkipPnkWizardStep(nutritionStep).ok, 'nutrition can skip')
ok(buildPnkWizardSkipPatch(nutritionStep)?.deliverable === 'nutrition', 'nutrition skip patch')

const cleared = clearPnkDeliverable(healthClient, 'visit_started')
ok(cleared.ok && !cleared.client.pnk_deliverables.visit_started, 'clear deliverable')

const backApplied = applyPnkStagePatch({
  client: healthClient,
  clear_deliverable: 'visit_started',
})
ok(backApplied.ok && !backApplied.client.pnk_deliverables.visit_started, 'apply clear_deliverable')
ok(resolvePnkWizardStep(backApplied.client)?.key === 'wait', 'after clear → wait')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-wizard-nav: all ok')
