/**
 * Краевые случаи ПНК после тренировки: рассинхрон deliverables / bzCompletedCount.
 * node scripts/verify-pnk-post-training-edge.mjs
 */
import { buildPnkGlanceCard } from '../src/lib/pnk/pnkTrainerGlanceCore.js'
import {
  buildPnkAttentionFlags,
  resolvePnkTrainerUiStep,
  isPnkCardTabVisible,
} from '../src/lib/pnk/pnkStagesCore.js'
import { resolvePnkFunnelHatNav } from '../src/lib/pnk/pnkWizardNavCore.js'
import { isPnkVisitPackageOpen, resolvePnkWizardStep } from '../src/lib/pnk/pnkWizardCore.js'
import { listPnkAttentionClients } from '../src/lib/pnk/pnkStatsAgg.js'
import { buildPnkManagerHomeGlance } from '../src/lib/pnk/pnkManagerHomeGlanceCore.js'

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
  pnk_deliverables: {
    contact: 'x',
    visit_started: 'x',
    health: 'x',
    nutrition: 'x',
  },
}

/** Тренировка завершена локально, trial deliverable ещё не проставлен. */
const afterWorkoutNoTrialMark = { ...base, pnk_stage: 'agreed' }
const bzCtx = { bzCompletedCount: 1 }

ok(
  resolvePnkWizardStep(afterWorkoutNoTrialMark, bzCtx)?.key === 'hw1',
  'card ctx: bz=1 без trial → hw1',
)
ok(
  resolvePnkWizardStep(afterWorkoutNoTrialMark)?.key === 'train1',
  'без ctx bz → train1 (legacy)',
)
ok(
  buildPnkGlanceCard(afterWorkoutNoTrialMark, new Date(), bzCtx)?.stepTitle === 'Домашнее задание',
  'glance с bz ctx → hw1',
)
ok(
  buildPnkGlanceCard(afterWorkoutNoTrialMark)?.stepTitle === 'Тренировка',
  'glance без bz → train1',
)

const flagsWithBz = buildPnkAttentionFlags(afterWorkoutNoTrialMark, new Date(), bzCtx)
ok(!flagsWithBz.some((f) => f.code === 'noshow'), 'bz=1: нет noshow после завершённой БЗ')
ok(!flagsWithBz.some((f) => f.code === 'need_followup'), 'bz=1 на hw1: нет followup флага')

/** stage=trial_done от TrainingPage, homework ещё нет */
const trialDoneStage = {
  ...afterWorkoutNoTrialMark,
  pnk_stage: 'trial_done',
  pnk_deliverables: { ...afterWorkoutNoTrialMark.pnk_deliverables, trial: '2026-07-20T18:00:00.000Z' },
}
ok(
  !buildPnkAttentionFlags(trialDoneStage).some((f) => f.code === 'need_followup'),
  'trial_done + hw pending: need_followup не горит рано',
)

/** followup: вкладки скрыты */
const onFollowup = {
  ...trialDoneStage,
  pnk_deliverables: { ...trialDoneStage.pnk_deliverables, homework: 'x' },
}
ok(resolvePnkTrainerUiStep(onFollowup, bzCtx)?.key === 'followup', '→ followup')
ok(!isPnkCardTabVisible(onFollowup, 'homework', bzCtx), 'followup: homework tab hidden')

/** train1: CTA в body до bz, в hat после */
const trainStep = resolvePnkWizardStep(base, { bzCompletedCount: 0 })
ok(resolvePnkFunnelHatNav(base, trainStep, { bzCompletedCount: 0 }).primarySlot === 'body', 'train1 CTA body')
ok(
  resolvePnkFunnelHatNav(base, trainStep, { bzCompletedCount: 1 }).primarySlot === 'hat',
  'train1 CTA hat after BZ',
)

/** N=2 train2 при bz=1 */
ok(
  resolvePnkWizardStep(
    {
      ...base,
      pnk_trial_sessions: 2,
      pnk_deliverables: { ...base.pnk_deliverables, trial: 'x', homework: 'x' },
    },
    { bzCompletedCount: 1 },
  )?.key === 'train2',
  'N=2 on train2 with bz=1',
)

/** pull: trial снят, bz локально 1 */
const pullRollback = { ...base, pnk_deliverables: { ...base.pnk_deliverables } }
ok(resolvePnkWizardStep(pullRollback, bzCtx)?.key === 'hw1', 'pull без trial но bz=1 → hw1')
ok(resolvePnkWizardStep(pullRollback, { bzCompletedCount: 0 })?.key === 'train1', 'pull bz=0 → train1')

/** attention / glance: bz закрывает noshow при отстающем trial stamp */
const overdueNoTrial = {
  id: 'attn1',
  name: 'Шов',
  lifecycle: 'pnk',
  pnk_stage: 'agreed',
  pnk_trial_date: '2026-07-10',
  pnk_created_at: '2026-07-01T10:00:00.000Z',
  pnk_deliverables: { contact: 'x' },
}
const nowAttn = new Date('2026-07-16T12:00:00')
const attnNoBz = listPnkAttentionClients([overdueNoTrial], nowAttn)
ok(attnNoBz.some((r) => r.flags.some((f) => f.code === 'noshow')), 'без bz: noshow при просроченной дате')
const attnWithBz = listPnkAttentionClients([overdueNoTrial], nowAttn, {
  bzCompletedByClient: { attn1: 1 },
})
ok(!attnWithBz.some((r) => r.flags.some((f) => f.code === 'noshow')), 'с bz=1: noshow не горит')

const emptyPack = {
  visit_started: null,
  health: null,
  nutrition: null,
  trial: null,
  homework: null,
  trial2: null,
  homework2: null,
  contact: 'x',
  followup: null,
}
ok(!isPnkVisitPackageOpen(overdueNoTrial, emptyPack, nowAttn, 0), 'bz=0: пакет закрыт без stamp')
ok(isPnkVisitPackageOpen(overdueNoTrial, emptyPack, nowAttn, 1), 'bz=1: пакет открыт без stamp')

const glanceHot = buildPnkManagerHomeGlance([overdueNoTrial], nowAttn)
ok(glanceHot.isHot, 'glance без bz: hot от noshow')
const glanceCool = buildPnkManagerHomeGlance([overdueNoTrial], nowAttn, {
  bzCompletedByClient: { attn1: 1 },
})
ok(glanceCool.hotCount === 0 && !glanceCool.isHot, 'glance с bz: не hot из-за noshow')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-post-training-edge: all ok')
