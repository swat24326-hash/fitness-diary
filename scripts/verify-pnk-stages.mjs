/**
 * node scripts/verify-pnk-stages.mjs
 */
import {
  PNK_STAGE_LABELS,
  applyPnkStagePatch,
  buildNewPnkClientFields,
  buildPnkAttentionFlags,
  buildPnkDemoScenarioForm,
  canAdvancePnkStage,
  canDeletePnkClient,
  isOpenPnkClient,
  markPnkDeliverable,
  matchesPnkBoardFilter,
  pnkNextActionHint,
  pnkPackageProgress,
  resolvePnkTrainerUiStep,
  resolvePnkVisitDayState,
  isPnkCardTabVisible,
} from '../src/lib/pnk/pnkStagesCore.js'
import { aggregatePnkFunnelStats, listPnkAttentionClients } from '../src/lib/pnk/pnkStatsAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(PNK_STAGE_LABELS.agreed === 'Дата бесплатной', 'labels')
ok(canAdvancePnkStage('assigned', 'agreed'), 'assigned → agreed')
ok(canAdvancePnkStage('new', 'won') === false, 'new cannot win')
ok(canAdvancePnkStage('agreed', 'lost'), 'agreed → lost')
ok(canAdvancePnkStage('won', 'lost') === false, 'won closed')

const fields = buildNewPnkClientFields({ trainer_id: 't1', pnk_source: 'manager' })
ok(fields.lifecycle === 'pnk' && fields.pnk_stage === 'assigned', 'new pnk assigned')

const base = {
  id: 'c1',
  name: 'Тестов',
  trainer_id: 't1',
  lifecycle: 'pnk',
  pnk_stage: 'assigned',
  pnk_created_at: '2026-07-01T10:00:00.000Z',
  pnk_deliverables: {},
  pnk_comments: [],
}

const agreed = applyPnkStagePatch({
  client: base,
  stage: 'agreed',
  trial_date: '2026-07-10',
  trial_time: '18:00',
  comment: 'Договорились',
  by_role: 'trainer',
})
ok(agreed.ok === true, 'agree patch ok')
ok(agreed.client.pnk_trial_date === '2026-07-10', 'trial date set')
ok(agreed.client.pnk_comment === 'Договорились', 'comment last')
ok(isOpenPnkClient(agreed.client), 'still open')

const noDate = applyPnkStagePatch({ client: base, stage: 'agreed' })
ok(noDate.ok === false, 'agreed without date fails')

const withContact = markPnkDeliverable(agreed.client, 'contact', '2026-07-09T12:00:00.000Z')
ok(withContact.ok && withContact.client.pnk_deliverables.contact, 'contact marked')

const noshow = buildPnkAttentionFlags(
  { ...agreed.client, pnk_deliverables: {} },
  new Date('2026-07-11T12:00:00'),
)
ok(noshow.some((f) => f.code === 'noshow'), 'noshow flag after trial date')

const noshowGone = buildPnkAttentionFlags(
  {
    ...agreed.client,
    pnk_deliverables: { visit_started: '2026-07-11T10:00:00.000Z' },
  },
  new Date('2026-07-11T12:00:00'),
)
ok(!noshowGone.some((f) => f.code === 'noshow'), 'no noshow after Клиент пришёл')

const trialDone = applyPnkStagePatch({
  client: agreed.client,
  stage: 'trial_done',
  deliverable: 'trial',
})
ok(trialDone.ok && trialDone.client.pnk_deliverables.trial, 'trial done')
ok(Boolean(trialDone.client.pnk_deliverables.visit_started), 'trial also marks visit_started')

const trialHealOnly = applyPnkStagePatch({
  client: {
    ...agreed.client,
    pnk_deliverables: { contact: 'x', health: 'x', nutrition: 'x' },
  },
  deliverable: 'trial',
})
ok(
  trialHealOnly.ok &&
    trialHealOnly.client.pnk_deliverables.trial &&
    trialHealOnly.client.pnk_deliverables.visit_started,
  'deliverable trial heals missing visit_started',
)

let pkgClient = trialDone.client
pkgClient = markPnkDeliverable(pkgClient, 'nutrition').client
pkgClient = markPnkDeliverable(pkgClient, 'homework').client
ok(pnkPackageProgress(pkgClient).done, 'package complete')

const won = applyPnkStagePatch({ client: pkgClient, stage: 'won' })
ok(won.ok && won.client.lifecycle === 'active' && won.client.pnk_stage === 'won', 'won → active')
ok(!isOpenPnkClient(won.client), 'won not open')

const lost = applyPnkStagePatch({ client: agreed.client, stage: 'lost', lost_reason: 'Дорого' })
ok(lost.ok && lost.client.lifecycle === 'pnk_lost' && lost.client.pnk_stage === 'lost', 'lost → pnk_lost')
ok(!isOpenPnkClient(lost.client), 'lost not open')
ok(lost.client.pnk_lost_reason === 'Дорого', 'lost reason kept')

const wonBlocked = applyPnkStagePatch({
  client: pkgClient,
  stage: 'won',
  require_dk_membership: true,
  has_dk_membership: false,
})
ok(!wonBlocked.ok, 'won blocked without ДК when required')
const wonWithDk = applyPnkStagePatch({
  client: pkgClient,
  stage: 'won',
  require_dk_membership: true,
  has_dk_membership: true,
})
ok(wonWithDk.ok && wonWithDk.client.lifecycle === 'active', 'won ok with ДК flag')

const clients = [
  {
    id: 'a',
    name: 'A',
    trainer_id: 't1',
    lifecycle: 'pnk',
    pnk_stage: 'assigned',
    pnk_created_at: '2026-07-05',
    pnk_deliverables: {},
  },
  {
    id: 'b',
    name: 'B',
    trainer_id: 't1',
    lifecycle: 'active',
    pnk_stage: 'won',
    pnk_created_at: '2026-07-02',
    pnk_won_at: '2026-07-08',
    pnk_deliverables: { nutrition: 'x', homework: 'y', trial: 'z' },
  },
]
const stats = aggregatePnkFunnelStats(clients, { dateFrom: '2026-07-01', dateTo: '2026-07-31' })
ok(stats.entered === 2 && stats.won === 1, `entered/won ${stats.entered}/${stats.won}`)
ok(stats.conversionPct === 50, `conversion ${stats.conversionPct}`)

const lateWin = aggregatePnkFunnelStats(
  [
    {
      id: 'old',
      trainer_id: 't1',
      lifecycle: 'active',
      pnk_stage: 'won',
      pnk_created_at: '2026-01-01',
      pnk_won_at: '2026-07-15',
    },
    {
      id: 'new',
      trainer_id: 't1',
      lifecycle: 'pnk',
      pnk_stage: 'assigned',
      pnk_created_at: '2026-07-10',
    },
  ],
  { dateFrom: '2026-07-01', dateTo: '2026-07-31' },
)
ok(lateWin.entered === 1 && lateWin.won === 1, 'period: open only if entered in window')
ok(lateWin.conversionPct === 0, 'conversion uses cohort won, not wins outside cohort')
ok(stats.trainers[0]?.trainerId === 't1', 'by trainer')

const attn = listPnkAttentionClients(
  [{ ...clients[0], pnk_created_at: '2026-06-01T00:00:00.000Z' }],
  new Date('2026-07-16T12:00:00'),
)
ok(attn.length >= 1 && attn[0].flags.some((f) => f.code === 'need_contact'), 'attention need contact')

const demo = buildPnkDemoScenarioForm('t1')
ok(demo.name.includes('Иванов') && demo.trainer_id === 't1', 'demo scenario form')

const waitCall = {
  id: 'c1',
  lifecycle: 'pnk',
  pnk_stage: 'assigned',
  pnk_deliverables: {},
}
ok(matchesPnkBoardFilter(waitCall, 'call'), 'filter call')
ok(matchesPnkBoardFilter({ ...waitCall, pnk_trial_date: '2026-07-20' }, 'date'), 'filter date')
ok(pnkNextActionHint(waitCall)?.key === 'contact', 'next hint contact when no contact')
ok(
  pnkNextActionHint({
    ...waitCall,
    pnk_stage: 'contact',
    pnk_deliverables: { contact: 'x' },
  })?.key === 'date',
  'next hint date after contact',
)
ok(
  pnkNextActionHint({
    ...waitCall,
    pnk_deliverables: { contact: 'x' },
    pnk_trial_date: '2026-07-20',
  })?.key === 'wait',
  'next hint wait after date before visit',
)
ok(
  pnkNextActionHint({
    ...waitCall,
    pnk_deliverables: { contact: 'x', health: 'h', nutrition: 'n', trial: 'y', homework: 'hw' },
    pnk_trial_date: '2026-07-20',
    pnk_trial_sessions: 1,
  })?.key === 'followup',
  'next hint followup after free path',
)
const ui = resolvePnkTrainerUiStep(waitCall)
ok(ui?.key === 'contact' && ui.title === 'Связь с клиентом', 'trainer ui step contact')

ok(canDeletePnkClient({ id: '1', lifecycle: 'pnk' }), 'can delete open pnk')
ok(canDeletePnkClient({ id: '2', lifecycle: 'pnk_lost' }), 'can delete lost pnk')
ok(!canDeletePnkClient({ id: '3', lifecycle: 'active' }), 'cannot delete active dk')

const visitBase = {
  id: 'v1',
  lifecycle: 'pnk',
  pnk_stage: 'agreed',
  pnk_trial_date: '2026-07-17',
  pnk_deliverables: { contact: 'x' },
}
ok(resolvePnkVisitDayState(visitBase, new Date('2026-07-17T12:00:00')) === 'today', 'visit today')
ok(resolvePnkVisitDayState(visitBase, new Date('2026-07-16T12:00:00')) === 'before', 'visit before')
ok(resolvePnkVisitDayState(visitBase, new Date('2026-07-18T12:00:00')) === 'past', 'visit past')
ok(!isPnkCardTabVisible(visitBase, 'stats'), 'stats hidden while pnk open')
ok(!isPnkCardTabVisible(visitBase, 'loyalty'), 'loyalty hidden while pnk open')
ok(!isPnkCardTabVisible(visitBase, 'health'), 'health hidden until Клиент пришёл')
const onHealthStep = {
  ...visitBase,
  pnk_deliverables: { contact: 'x', visit_started: 'x' },
}
ok(isPnkCardTabVisible(onHealthStep, 'health'), 'only health on health step')
ok(!isPnkCardTabVisible(onHealthStep, 'nutrition'), 'nutrition hidden on health step')
ok(!isPnkCardTabVisible(onHealthStep, 'diaries'), 'diaries hidden on health step')
ok(!isPnkCardTabVisible(onHealthStep, 'homework'), 'homework hidden on health step')
ok(!isPnkCardTabVisible(onHealthStep, 'memberships'), 'memberships hidden on health step')
ok(
  !isPnkCardTabVisible({ id: 'v2', lifecycle: 'pnk', pnk_stage: 'assigned' }, 'health'),
  'tabs hidden before contact done',
)
const afterHealth = {
  ...visitBase,
  pnk_deliverables: { contact: 'x', visit_started: 'x', health: 'x' },
}
ok(isPnkCardTabVisible(afterHealth, 'nutrition'), 'only nutrition on nutrition step')
ok(!isPnkCardTabVisible(afterHealth, 'health'), 'health tab hidden on nutrition step')
ok(!isPnkCardTabVisible(afterHealth, 'diaries'), 'diaries hidden on nutrition step')
const afterNutrition = {
  ...visitBase,
  pnk_deliverables: { contact: 'x', visit_started: 'x', health: 'x', nutrition: 'x' },
}
ok(isPnkCardTabVisible(afterNutrition, 'diaries'), 'only diaries on train step')
ok(!isPnkCardTabVisible(afterNutrition, 'memberships'), 'memberships hidden on train step')
ok(!isPnkCardTabVisible(afterNutrition, 'nutrition'), 'nutrition hidden on train step')
ok(!isPnkCardTabVisible(afterNutrition, 'homework'), 'homework hidden on train step')
const afterTrial = {
  ...visitBase,
  pnk_stage: 'trial_done',
  pnk_deliverables: { contact: 'x', visit_started: 'x', health: 'x', nutrition: 'x', trial: 'x' },
}
ok(isPnkCardTabVisible(afterTrial, 'homework'), 'only homework on hw step')
ok(!isPnkCardTabVisible(afterTrial, 'diaries'), 'diaries hidden on hw step')
const onClose = {
  ...visitBase,
  pnk_stage: 'followup',
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
ok(isPnkCardTabVisible(onClose, 'memberships'), 'memberships visible on close for ДК')
ok(!isPnkCardTabVisible(onClose, 'health'), 'health hidden on close')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-stages: all ok')
