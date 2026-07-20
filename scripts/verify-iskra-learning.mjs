/**
 * node scripts/verify-iskra-learning.mjs
 */
import {
  ISKRA_LEARNING_PHASE,
  aggregateLearningSignals,
  applyLearningEventToSignalRow,
  buildLearnedPromptAppend,
  buildLearningBundleFromRows,
  buildLearningSignalKey,
  deriveReplySignalKey,
  extractLearningPlaybooks,
  extractOwnerCorrections,
  normalizeLearningEvent,
  normalizePlaybookSave,
  rankProactiveHintsByLearning,
  shouldPromoteToPlaybook,
} from '../src/lib/admin/iskraLearningCore.js'
import {
  buildIskraLearningContext,
  buildLearningMetaForResponse,
  mergeLearningIntoPromptAppend,
  rankHintsWithLearning,
} from '../src/lib/admin/iskraLearningPipeline.js'
import { buildIskraProactiveHints } from '../src/lib/admin/iskraProactiveHints.js'
import {
  buildOwnerFeedbackPromptAppend,
  detectOwnerFeedbackFromMessage,
} from '../src/lib/admin/iskraOwnerFeedbackDetectCore.js'
import {
  shouldKeepClubContextOnOffTopic,
  shouldUseAdminJarvisMode,
} from '../src/lib/admin/iskraAdminJarvisCore.js'
import { buildProductGapAskRule } from '../src/lib/admin/iskraDataAvailability.js'
import {
  buildClarifyingPromptRule,
  findPendingClarifyingQuestion,
  ISKRA_CLARIFYING_PREFIX,
  parseClarifyingAnswer,
  resolveIskraClarifyingAsk,
} from '../src/lib/admin/iskraClarifyingCore.js'
import {
  buildDispatchLearningEvent,
  buildDispatchLearningSignalKey,
} from '../src/lib/admin/iskraDispatchLearningCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(buildLearningSignalKey('hint', 'plan_behind') === 'hint:plan_behind', 'signal key hint')
ok(buildLearningSignalKey('chip', 'advice') === 'chip:advice', 'signal key chip')

const replyKey = deriveReplySignalKey('Как выполнен план продаж?', { chip_id: 'plan' })
ok(replyKey === 'chip:plan', 'derive reply key from chip')

const bad = normalizeLearningEvent({ event_type: 'nope' })
ok(!bad.ok, 'reject unknown event')

const ev = normalizeLearningEvent({
  club_id: 'club-1',
  event_type: 'feedback_up',
  signal_key: 'chip:advice',
})
ok(ev.ok && ev.event.club_id === 'club-1', 'normalize feedback_up')

const events = [
  { club_id: 'c1', event_type: 'feedback_up', signal_key: 'hint:advice' },
  { club_id: 'c1', event_type: 'feedback_up', signal_key: 'hint:advice' },
  { club_id: 'c1', event_type: 'feedback_down', signal_key: 'hint:risks' },
  { club_id: 'c1', event_type: 'hint_click', signal_key: 'hint:plan_behind' },
]
const agg = aggregateLearningSignals(events)
ok(agg.find((s) => s.signal_key === 'hint:advice')?.positive_count === 2, 'aggregate positive')
ok(agg.find((s) => s.signal_key === 'hint:plan_behind')?.engagement_count === 1, 'aggregate engagement')

const promotable = {
  signal_key: 'chip:plan',
  positive_count: 4,
  negative_count: 0,
  engagement_count: 2,
  score: 3,
  playbook_confirmed: false,
}
ok(shouldPromoteToPlaybook(promotable), 'auto promote playbook')
ok(!shouldPromoteToPlaybook({ ...promotable, positive_count: 1 }), 'no promote with few positives')

const playbooks = extractLearningPlaybooks([promotable])
ok(playbooks.length === 1, 'extract playbooks')

const bundle = buildLearningBundleFromRows([
  {
    signal_key: 'chip:plan',
    positive_count: 4,
    negative_count: 0,
    engagement_count: 1,
    score: 3,
    playbook_confirmed: true,
    playbook_note: 'В этом клубе сначала смотрят план по направлениям.',
  },
])
ok(bundle.playbooks.length >= 1, 'bundle from rows')

const append = buildLearnedPromptAppend(bundle)
ok(append.includes('УРОКИ КЛУБА'), 'learned prompt append')
ok(append.includes('направлениям'), 'playbook note in append')

const saveOk = normalizePlaybookSave({ club_id: 'c1', signal_key: 'chip:plan', note: 'Сначала план' })
ok(saveOk.ok, 'normalize playbook save')

const learningCtx = buildIskraLearningContext({ learningBundle: bundle })
const merged = mergeLearningIntoPromptAppend('Базовый промпт', learningCtx)
ok(merged.includes('Базовый промпт') && merged.includes('УРОКИ КЛУБА'), 'merge learning into prompt')

const meta = buildLearningMetaForResponse(learningCtx)
ok(meta.learning_playbooks >= 1, 'learning meta')

const hints = buildIskraProactiveHints({ plan_progress_pct: 30, report_days: 0 })
const ranked = rankProactiveHintsByLearning(hints, [
  { signal_key: 'hint:risks', score: 5 },
  { signal_key: 'hint:plan_behind', score: 1 },
])
ok(ranked[0]?.id === 'risks' || ranked[0]?.id === 'plan_behind', 'rank hints by score')
ok(rankHintsWithLearning(hints, learningCtx).length === hints.length, 'pipeline rank hints')

const row = applyLearningEventToSignalRow(null, ev.event)
ok(row.positive_count === 1 && row.score > 0, 'apply event to empty row')

ok(ISKRA_LEARNING_PHASE === 'apply' || ISKRA_LEARNING_PHASE === 'collect', 'learning phase set')

const corrEv = normalizeLearningEvent({
  club_id: 'c1',
  event_type: 'correction',
  signal_key: 'reply:freeform',
  note: 'Говори короче и без лозунгов.',
})
ok(corrEv.ok, 'normalize correction with note')
const corrRow = applyLearningEventToSignalRow(null, corrEv.event)
ok(corrRow.playbook_note.includes('короче'), 'correction note stored on signal')
const ownerFromCorr = extractOwnerCorrections([corrRow])
ok(ownerFromCorr.length === 1 && ownerFromCorr[0].note.includes('короче'), 'extract owner corrections')
const ownerAppend = buildLearnedPromptAppend({
  signals: [corrRow],
  playbooks: [],
  owner_corrections: ownerFromCorr,
  phase: 'apply',
})
ok(ownerAppend.includes('ПРАВКИ ВЛАДЕЛЬЦА') && ownerAppend.includes('короче'), 'owner corrections in prompt append')

const prefEv = normalizeLearningEvent({
  club_id: 'c1',
  event_type: 'preference',
  signal_key: 'owner:style',
  note: 'Стиль: короче, без воды, сначала суть.',
})
ok(prefEv.ok, 'normalize preference event')
const prefAgg = aggregateLearningSignals([prefEv.event])
ok(prefAgg[0]?.playbook_note.includes('Стиль'), 'preference note in aggregate')

const hits = detectOwnerFeedbackFromMessage('Короче, и запомни: сначала план по ПЗ')
ok(hits.some((h) => h.kind === 'style_compact'), 'detect style compact')
ok(hits.some((h) => h.kind === 'remember'), 'detect remember phrase')
ok(buildOwnerFeedbackPromptAppend(hits).includes('ПРАВКИ ВЛАДЕЛЬЦА'), 'owner feedback prompt block')

ok(shouldUseAdminJarvisMode({ advisorRoleId: 'app_admin', responseMode: 'standard' }), 'admin jarvis on')
ok(!shouldUseAdminJarvisMode({ advisorRoleId: 'app_admin', responseMode: 'brief' }), 'brief not jarvis')
ok(shouldKeepClubContextOnOffTopic({ advisorRoleId: 'app_admin', responseMode: 'deep' }), 'jarvis keeps club json')
ok(buildProductGapAskRule().includes('ПРОБЕЛЫ ДАННЫХ'), 'product gap ask rule')

const clarifySkip = resolveIskraClarifyingAsk({
  jarvis: true,
  userMessage: 'Короче пожалуйста',
  messages: [],
  learningBundle: { signals: [] },
})
ok(!clarifySkip.ask && clarifySkip.reason === 'user_already_correcting', 'clarify skip when correcting')

const clarifyPeriodic = resolveIskraClarifyingAsk({
  jarvis: true,
  userMessage: 'Как план?',
  messages: [
    { role: 'user', content: '1' },
    { role: 'assistant', content: 'a' },
    { role: 'user', content: '2' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: '3' },
    { role: 'assistant', content: 'c' },
  ],
  learningBundle: { signals: [] },
})
ok(clarifyPeriodic.ask && clarifyPeriodic.reason === 'periodic', 'clarify every 4th user turn')
ok(
  buildClarifyingPromptRule(clarifyPeriodic).includes(ISKRA_CLARIFYING_PREFIX),
  'clarify prompt rule has prefix',
)

const clarifyRecent = resolveIskraClarifyingAsk({
  jarvis: true,
  userMessage: 'Ещё',
  messages: [{ role: 'assistant', content: `${ISKRA_CLARIFYING_PREFIX} фокус тот же?` }],
  learningBundle: { signals: [] },
})
ok(clarifyRecent.ask === false, 'clarify skip if recently asked')

const pending = findPendingClarifyingQuestion([
  { role: 'assistant', content: 'Ответ.\nУточню: важнее сейчас план продаж, команда или другой фокус?' },
])
ok(pending?.reason === 'course_stop', 'find pending clarifying')
const ans = parseClarifyingAnswer('План продаж и выручка', pending)
ok(ans?.signal_key === 'owner:focus', 'parse clarifying answer to focus')

const dispatchKey = buildDispatchLearningSignalKey('done', { insightKey: 'inactive_clients' })
ok(dispatchKey.startsWith('dispatch:'), 'dispatch signal key')
const dispatchEv = buildDispatchLearningEvent({
  clubId: 'c1',
  action: 'done',
  insightKey: 'inactive_clients',
  title: 'Обзвонить неактивных',
})
ok(dispatchEv?.event_type === 'dispatch_done', 'dispatch done event')
const dispatchNorm = normalizeLearningEvent(dispatchEv)
ok(dispatchNorm.ok, 'normalize dispatch learning event')
const dispatchRow = applyLearningEventToSignalRow(null, dispatchNorm.event)
ok(dispatchRow.positive_count === 1 && dispatchRow.playbook_note.includes('выполнено'), 'dispatch done applies')

if (failed) process.exit(1)
console.log('verify-iskra-learning: all passed')
