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

ok(PNK_STAGE_LABELS.agreed === 'Дата пробной', 'labels')
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

const trialDone = applyPnkStagePatch({
  client: agreed.client,
  stage: 'trial_done',
  deliverable: 'trial',
})
ok(trialDone.ok && trialDone.client.pnk_deliverables.trial, 'trial done')

let pkgClient = trialDone.client
pkgClient = markPnkDeliverable(pkgClient, 'nutrition').client
pkgClient = markPnkDeliverable(pkgClient, 'homework').client
ok(pnkPackageProgress(pkgClient).done, 'package complete')

const won = applyPnkStagePatch({ client: pkgClient, stage: 'won' })
ok(won.ok && won.client.lifecycle === 'active' && won.client.pnk_stage === 'won', 'won → active')
ok(!isOpenPnkClient(won.client), 'won not open')

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
ok(pnkNextActionHint(waitCall)?.key === 'created', 'next hint created')
ok(
  pnkNextActionHint({
    ...waitCall,
    pnk_stage: 'contact',
  })?.key === 'invite',
  'next hint invite',
)
ok(
  pnkNextActionHint({
    ...waitCall,
    pnk_deliverables: { contact: 'x' },
    pnk_trial_date: '2026-07-20',
  })?.key === 'visit',
  'next hint visit',
)
ok(
  pnkNextActionHint({
    ...waitCall,
    pnk_deliverables: { contact: 'x', trial: 'y' },
    pnk_trial_date: '2026-07-20',
  })?.key === 'followup',
  'next hint followup',
)
const ui = resolvePnkTrainerUiStep(waitCall)
ok(ui?.n === 1 && ui.title === 'ПНК создан', 'trainer ui step 1')

ok(canDeletePnkClient({ id: '1', lifecycle: 'pnk' }), 'can delete open pnk')
ok(canDeletePnkClient({ id: '2', lifecycle: 'pnk_lost' }), 'can delete lost pnk')
ok(!canDeletePnkClient({ id: '3', lifecycle: 'active' }), 'cannot delete active dk')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-stages: all ok')
